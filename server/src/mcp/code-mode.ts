import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js"
import { LIMITS, runCode } from "./sandbox.js"

// Code Mode: instead of every tool, the client sees two. search finds tools by what they do
// and shows their input types; execute runs code that calls them and returns only the result.
// The tool list stays the same size however many connections a token reaches, and
// intermediate results never enter the model's context.

export type CodeModeContext = {
  catalog: () => Promise<Tool[]>
  call: (
    name: string,
    args: Record<string, unknown> | undefined
  ) => Promise<CallToolResult>
  connections: { prefix: string; name: string }[]
  secrets: boolean
}

const SEARCH = "search"
const EXECUTE = "execute"
// Longer output is cut: the model asked for it, but a runaway result shouldn't fill its context.
const MAX_OUTPUT = 24_000
const DESCRIPTION_CHARS = 600

export function codeModeTools(ctx: CodeModeContext): Tool[] {
  const reach = ctx.connections.length
    ? ctx.connections
        .map((c) => `${c.prefix.replace(/__$/, "")} (${c.name})`)
        .join(", ")
    : "none yet"
  const vault = ctx.secrets
    ? " The vault is searchable too (keyhall__list_secrets, keyhall__get_secret)."
    : ""
  return [
    {
      name: SEARCH,
      description: `Find the tools keyhall can call for you. Search by what you want to do (e.g. "deploy application", "dns records"); each result shows the tool name to pass to call(), its description and its input type. Connections: ${reach}. Tool names start with the connection prefix.${vault}`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Words describing the task, or a connection prefix to list its tools",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "Results to return (default 10)",
          },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: EXECUTE,
      description: `Run JavaScript that calls keyhall tools and return only what you need. The code is the body of an async function:
- await call("tool_name", { ...input }) calls a tool (names and inputs from search) and returns its result, parsed from JSON when possible; a failed call throws an Error;
- chain, loop, filter and combine calls in one run instead of calling tools one by one;
- return the final value (it must be JSON-serializable); console.log output is returned too.
There is no fetch, require, file system or timers. Limits per run: ${LIMITS.timeoutMs / 1000} s, ${LIMITS.calls} calls, ${LIMITS.memoryBytes / 1024 / 1024} MB.

Example:
const apps = await call("dokploy__application-search", { name: "web" })
return apps.items.map((a) => ({ id: a.applicationId, status: a.applicationStatus }))`,
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
      },
    },
  ]
}

const text = (value: string, isError = false): CallToolResult => ({
  ...(isError ? { isError } : {}),
  content: [{ type: "text", text: value }],
})

export async function callCodeMode(
  ctx: CodeModeContext,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  if (name === SEARCH)
    return search(ctx, String(args?.query ?? ""), Number(args?.limit) || 10)
  if (name === EXECUTE) return execute(ctx, String(args?.code ?? ""))
  return text(`Unknown tool: ${name}. Use search, then execute.`, true)
}

// Words of a name or query: camelCase, kebab-case and snake_case all split apart.
const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

// "projects" finds "project", "policies" finds "policy".
function forms(term: string) {
  const out = new Set([term])
  if (term.length > 3 && term.endsWith("ies")) out.add(`${term.slice(0, -3)}y`)
  if (term.length > 3 && term.endsWith("es")) out.add(term.slice(0, -2))
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss"))
    out.add(term.slice(0, -1))
  return [...out]
}

// Verbs that tools name differently; a synonym in the name counts a little less.
const SYNONYMS: Record<string, string[]> = {
  list: ["all", "search", "find", "ls"],
  get: ["one", "read", "fetch", "show", "retrieve"],
  find: ["search", "list"],
  search: ["find", "list", "query"],
  create: ["add", "new", "insert"],
  delete: ["remove", "rm", "destroy"],
  update: ["edit", "set", "patch", "modify"],
  start: ["deploy", "run", "resume"],
  stop: ["pause", "suspend", "kill"],
}

async function search(ctx: CodeModeContext, query: string, limit: number) {
  const tools = await ctx.catalog()
  const q = query.trim().toLowerCase()
  // A connection named in the query (or a prefix like "dokploy__") narrows the search to it.
  const prefixes = ctx.connections.map((c) => c.prefix.toLowerCase())
  const named = prefixes.filter((prefix) => {
    const slug = prefix.replace(/__$/, "")
    return (
      q === slug ||
      q.startsWith(prefix) ||
      words(q).includes(slug.split("__").pop() ?? slug)
    )
  })
  const pool = named.length
    ? tools.filter((t) =>
        named.some((prefix) => t.name.toLowerCase().startsWith(prefix))
      )
    : tools
  const slugs = new Set(
    named.flatMap((prefix) => words(prefix.replace(/__$/, "")))
  )
  const terms = words(q).filter((t) => !slugs.has(t))

  const scored = !terms.length
    ? pool.map((tool) => ({ tool, score: 1 }))
    : pool
        .map((tool) => {
          const prefix = prefixes.find((p) =>
            tool.name.toLowerCase().startsWith(p)
          )
          const name = new Set(words(tool.name.slice(prefix?.length ?? 0)))
          const description = (tool.description ?? "").toLowerCase()
          let score = 0
          let found = 0
          for (const term of terms) {
            const variants = forms(term)
            if (variants.some((v) => name.has(v))) score += 3
            else if ((SYNONYMS[term] ?? []).some((v) => name.has(v))) score += 2
            else if (variants.some((v) => description.includes(v))) score += 1
            else continue
            found++
          }
          // Every word found is worth more than one word found many times.
          if (found === terms.length) score += 2 * terms.length
          return { tool, score }
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)

  const shown = scored.slice(0, Math.min(Math.max(1, limit), 50))
  if (!shown.length)
    return text(
      `No tool matches "${query}" among ${tools.length}. Try other words, or a connection prefix: ${ctx.connections.map((c) => c.prefix).join(", ") || "none"}.`
    )
  const header = `${scored.length} of ${tools.length} tools match; showing ${shown.length}.`
  return text(
    [header, ...shown.map(({ tool }) => describeTool(tool))].join("\n\n")
  )
}

function describeTool(tool: Tool) {
  const description = (tool.description ?? "").trim()
  const lines = [tool.name]
  if (description)
    lines.push(
      `  ${description.length > DESCRIPTION_CHARS ? `${description.slice(0, DESCRIPTION_CHARS)}…` : description}`.replace(
        /\n/g,
        "\n  "
      )
    )
  lines.push(`  input: ${typeOf(tool.inputSchema, 1)}`)
  if (tool.outputSchema)
    lines.push(`  returns: ${typeOf(tool.outputSchema, 1)}`)
  return lines.join("\n")
}

type Schema = {
  type?: string | string[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  enum?: unknown[]
  const?: unknown
  anyOf?: Schema[]
  oneOf?: Schema[]
  allOf?: Schema[]
  additionalProperties?: boolean | Schema
  description?: string
}

// JSON Schema as a compact TypeScript type, which models read well and cheaply.
export function typeOf(schema: unknown, indent = 0, depth = 0): string {
  const s = (schema ?? {}) as Schema
  if (depth > 4) return "any"
  if (s.const !== undefined) return JSON.stringify(s.const)
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ")
  const union = s.anyOf ?? s.oneOf
  if (union)
    return [...new Set(union.map((u) => typeOf(u, indent, depth + 1)))].join(
      " | "
    )
  if (s.allOf)
    return s.allOf.map((u) => typeOf(u, indent, depth + 1)).join(" & ")
  const type = Array.isArray(s.type)
    ? s.type.filter((t) => t !== "null")[0]
    : s.type
  const nullable = Array.isArray(s.type) && s.type.includes("null")
  const base = (() => {
    if (type === "string") return "string"
    if (type === "integer" || type === "number") return "number"
    if (type === "boolean") return "boolean"
    if (type === "null") return "null"
    if (type === "array")
      return `${wrapUnion(typeOf(s.items, indent, depth + 1))}[]`
    if (type === "object" || s.properties) {
      const props = Object.entries(s.properties ?? {})
      if (!props.length)
        return typeof s.additionalProperties === "object"
          ? `Record<string, ${typeOf(s.additionalProperties, indent, depth + 1)}>`
          : "object"
      const pad = "  ".repeat(indent + 1)
      const required = new Set(s.required ?? [])
      const fields = props.map(([key, value]) => {
        const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
        const note = value?.description
          ? ` // ${value.description.replace(/\s+/g, " ").slice(0, 120)}`
          : ""
        return `${pad}${name}${required.has(key) ? "" : "?"}: ${typeOf(value, indent + 1, depth + 1)}${note}`
      })
      return `{\n${fields.join("\n")}\n${"  ".repeat(indent)}}`
    }
    return "any"
  })()
  return nullable ? `${base} | null` : base
}

const wrapUnion = (t: string) => (t.includes(" | ") ? `(${t})` : t)

// What call() returns inside the code: structured content, else the text parsed as JSON when
// it is JSON. A tool error becomes an exception.
function toValue(result: CallToolResult): unknown {
  const texts = result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
  if (result.isError) throw new Error(texts.join("\n") || "tool call failed")
  if (result.structuredContent) return result.structuredContent
  const others = result.content
    .filter((c) => c.type !== "text")
    .map((c) => ({
      type: c.type,
      ...("mimeType" in c ? { mimeType: c.mimeType } : {}),
    }))
  const parsed = texts.map((t) => {
    try {
      return JSON.parse(t) as unknown
    } catch {
      return t
    }
  })
  const values = [...parsed, ...others]
  return values.length === 1 ? values[0] : values
}

async function execute(ctx: CodeModeContext, code: string) {
  if (!code.trim()) return text("Empty code.", true)
  const run = await runCode(code, async (name, args) =>
    toValue(
      await ctx.call(
        name,
        args && typeof args === "object" && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : undefined
      )
    )
  )
  const logs = run.logs.length ? `\n\nconsole:\n${run.logs.join("\n")}` : ""
  if (!run.ok) return text(`Error: ${run.error}${logs}`, true)
  const out = JSON.stringify(run.result) ?? "null"
  const cut =
    out.length > MAX_OUTPUT
      ? `${out.slice(0, MAX_OUTPUT)}\n… cut at ${MAX_OUTPUT} of ${out.length} characters; return less (filter or pick fields).`
      : out
  return text(`${cut}${logs}`)
}
