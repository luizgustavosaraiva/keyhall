import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import releaseSyncModule from "@jitl/quickjs-wasmfile-release-sync"
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSDeferredPromise,
  type QuickJSSyncVariant,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten-core"

// Runs code written by an agent in QuickJS (WebAssembly): no network, no files, no process,
// no timers. Its only ways out are call(name, args), which the host answers with the same
// checks as a direct tool call, and tools(), which reads the catalog the token reaches. Values
// cross the boundary as JSON.

export type ToolCaller = (name: string, args: unknown) => Promise<unknown>
export type ToolLister = () => Promise<unknown>

export type RunResult =
  | { ok: true; result: unknown; logs: string[] }
  | { ok: false; error: string; logs: string[] }

export const LIMITS = {
  timeoutMs: 60_000,
  // A hard ceiling: QuickJS's own memory limit doesn't count every allocation (large strings
  // got past it in tests), so each run gets a WebAssembly memory that cannot grow beyond this.
  memoryBytes: 128 * 1024 * 1024,
  stackBytes: 1024 * 1024,
  calls: 100,
  logLines: 100,
  // Runs at the same time; the rest wait their turn.
  concurrent: 4,
}

// The package's types describe it as CommonJS; at run time its ESM default is the variant.
const releaseSync = releaseSyncModule as unknown as QuickJSSyncVariant

const PAGE = 64 * 1024
// The QuickJS build starts with 16 MB.
const INITIAL_PAGES = 256

// Compiled once; each run instantiates it with a memory of its own, released when the run ends.
let compiled: Promise<WebAssembly.Module> | undefined
const wasmModule = () =>
  (compiled ??= readFile(
    createRequire(import.meta.url).resolve(
      "@jitl/quickjs-wasmfile-release-sync/wasm"
    )
  ).then((bytes) => WebAssembly.compile(bytes)))

const freshQuickJS = async () =>
  newQuickJSWASMModuleFromVariant(
    newVariant(releaseSync, {
      wasmModule: await wasmModule(),
      wasmMemory: new WebAssembly.Memory({
        initial: INITIAL_PAGES,
        maximum: Math.max(INITIAL_PAGES, LIMITS.memoryBytes / PAGE),
      }),
    })
  )

let running = 0
const queue: (() => void)[] = []
async function slot() {
  if (running >= LIMITS.concurrent)
    await new Promise<void>((resolve) => queue.push(resolve))
  running++
  return () => {
    running--
    queue.shift()?.()
  }
}

const PRELUDE = `
globalThis.call = async (name, args) =>
  JSON.parse(await __call(String(name), JSON.stringify(args ?? {}) ?? "{}"))
globalThis.tools = async (prefix) => {
  const all = JSON.parse(await __tools())
  return prefix ? all.filter((t) => t.name.startsWith(String(prefix))) : all
}
const __fmt = (a) => a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")
globalThis.console = Object.freeze({
  log: (...a) => __log(__fmt(a)),
  info: (...a) => __log(__fmt(a)),
  warn: (...a) => __log(__fmt(a)),
  error: (...a) => __log(__fmt(a)),
})
`

// The code is the body of an async function. A bare async function (as some models write it)
// is called instead.
function wrap(code: string) {
  const body = /^\s*async\s*(\(|function\b)/.test(code)
    ? `return await (${code.trim().replace(/;\s*$/, "")})()`
    : code
  return `(async () => {
  const __r = await (async () => {
${body}
  })()
  return __r === undefined ? "null" : JSON.stringify(__r)
})()`
}

export async function runCode(
  code: string,
  callTool: ToolCaller,
  listTools: ToolLister = async () => []
): Promise<RunResult> {
  const release = await slot()
  try {
    return await run(code, callTool, listTools)
  } finally {
    release()
  }
}

async function run(
  code: string,
  callTool: ToolCaller,
  listTools: ToolLister
): Promise<RunResult> {
  const runtime = (await freshQuickJS()).newRuntime()
  runtime.setMaxStackSize(LIMITS.stackBytes)
  const deadline = Date.now() + LIMITS.timeoutMs
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline))
  const vm = runtime.newContext()

  const logs: string[] = []
  const pending = new Set<QuickJSDeferredPromise>()
  let calls = 0
  let closed = false

  const pump = () => {
    if (!closed) runtime.executePendingJobs()
  }

  const logFn = vm.newFunction("__log", (line) => {
    if (logs.length < LIMITS.logLines) logs.push(vm.getString(line))
    else if (logs.length === LIMITS.logLines) logs.push("… more lines dropped")
  })
  // A promise inside the VM that settles with the host's answer, as a JSON string.
  const answer = (work: () => Promise<unknown>) => {
    const deferred = vm.newPromise()
    pending.add(deferred)
    const settle = (fn: () => void) => {
      if (closed) return
      pending.delete(deferred)
      fn()
      deferred.dispose()
      pump()
    }
    work().then(
      (value) =>
        settle(() => {
          const s = vm.newString(JSON.stringify(value ?? null))
          deferred.resolve(s)
          s.dispose()
        }),
      (error: unknown) =>
        settle(() => {
          const err = vm.newError(
            error instanceof Error ? error.message : String(error)
          )
          deferred.reject(err)
          err.dispose()
        })
    )
    return deferred.handle
  }
  const callFn = vm.newFunction("__call", (nameH, argsH) => {
    const name = vm.getString(nameH)
    const args = JSON.parse(vm.getString(argsH)) as unknown
    if (++calls > LIMITS.calls)
      return answer(async () => {
        throw new Error(`More than ${LIMITS.calls} calls in one run`)
      })
    return answer(() => callTool(name, args))
  })
  // The catalog doesn't count as a call; it is read once per run.
  let catalog: Promise<unknown> | undefined
  const toolsFn = vm.newFunction("__tools", () =>
    answer(() => (catalog ??= listTools()))
  )
  vm.setProp(vm.global, "__log", logFn)
  vm.setProp(vm.global, "__call", callFn)
  vm.setProp(vm.global, "__tools", toolsFn)
  logFn.dispose()
  callFn.dispose()
  toolsFn.dispose()

  const fail = (error: string): RunResult => ({ ok: false, error, logs })
  let timer: NodeJS.Timeout | undefined
  try {
    vm.unwrapResult(vm.evalCode(PRELUDE, "prelude.js")).dispose()
    const started = vm.evalCode(wrap(code), "agent.js")
    if (started.error) {
      const error = vm.dump(started.error)
      started.error.dispose()
      return fail(describe(error))
    }
    const settled = vm.resolvePromise(started.value)
    started.value.dispose()
    pump()
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(
        () => resolve("timeout"),
        Math.max(0, deadline - Date.now())
      )
    })
    const outcome = await Promise.race([settled, timeout])
    if (outcome === "timeout")
      return fail(`Timed out after ${LIMITS.timeoutMs / 1000} s`)
    if (outcome.error) {
      const error = vm.dump(outcome.error)
      outcome.error.dispose()
      return fail(describe(error))
    }
    const json = vm.getString(outcome.value)
    outcome.value.dispose()
    return { ok: true, result: JSON.parse(json), logs }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timer)
    closed = true
    for (const d of pending) d.dispose()
    vm.dispose()
    runtime.dispose()
  }
}

function describe(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const { name, message } = error as { name?: string; message: string }
    if (name === "InternalError" && message === "interrupted")
      return `Timed out after ${LIMITS.timeoutMs / 1000} s`
    return name && name !== "Error" ? `${name}: ${message}` : message
  }
  // Running out of memory leaves no error object.
  return error ? String(error) : "Out of memory"
}
