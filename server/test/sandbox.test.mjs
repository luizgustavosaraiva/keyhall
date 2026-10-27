// The Code Mode sandbox on its own: limits that would take too long through the MCP endpoint.
import assert from "node:assert/strict"
import { test } from "node:test"
import { LIMITS, runCode } from "../dist/mcp/sandbox.js"

const tool = async (name, args) => {
  if (name === "fail") throw new Error("upstream said no")
  return { name, args }
}

test("returns the value and the console output", async () => {
  const run = await runCode(
    `const r = await call("a", { n: 1 }); console.log("n is", r.args.n); return r`,
    tool
  )
  assert.deepEqual(run, {
    ok: true,
    result: { name: "a", args: { n: 1 } },
    logs: ["n is 1"],
  })
})

test("tools() filters the catalog, read once and not counted as a call", async () => {
  let reads = 0
  const catalog = async () => {
    reads++
    return [
      { name: "mail__dispatch_message", description: "Sends an email" },
      { name: "dns__records", description: "Lists DNS records" },
    ]
  }
  const run = await runCode(
    `const all = await tools()
    const dns = await tools("dns__")
    return { mail: all.filter((t) => /email/i.test(t.description)).map((t) => t.name), dns: dns.length }`,
    tool,
    catalog
  )
  assert.deepEqual(run.ok && run.result, {
    mail: ["mail__dispatch_message"],
    dns: 1,
  })
  assert.equal(reads, 1)
})

test("accepts a bare async function", async () => {
  const run = await runCode("async () => { return 42 }", tool)
  assert.equal(run.ok && run.result, 42)
})

test("a failed tool call throws inside the code", async () => {
  const run = await runCode(
    `try { await call("fail") } catch (e) { return e.message }`,
    tool
  )
  assert.equal(run.ok && run.result, "upstream said no")
})

test("no way out but call()", async () => {
  const run = await runCode(
    "return [typeof fetch, typeof require, typeof process, typeof setTimeout, typeof WebAssembly]",
    tool
  )
  assert.deepEqual(run.ok && run.result, Array(5).fill("undefined"))
})

test("stops endless loops, hung promises, runaway memory and call floods", async () => {
  const timeout = LIMITS.timeoutMs
  LIMITS.timeoutMs = 1000
  try {
    for (const code of ["while (true) {}", "await new Promise(() => {})"]) {
      const run = await runCode(code, tool)
      assert.equal(run.ok, false)
      assert.match(run.error, /Timed out/)
    }
  } finally {
    LIMITS.timeoutMs = timeout
  }
  const memory = await runCode(
    `const a = []; for (;;) a.push("x".repeat(1e5) + a.length)`,
    tool
  )
  assert.match(memory.ok ? "" : memory.error, /out of memory/i)
  const flood = await runCode(
    `for (let i = 0; i < ${LIMITS.calls + 1}; i++) await call("a"); return 1`,
    tool
  )
  assert.match(flood.ok ? "" : flood.error, /More than \d+ calls/)
})
