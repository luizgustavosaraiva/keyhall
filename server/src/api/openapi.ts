import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import { decrypt } from "../crypto.js"
import type { connection } from "../db/schema.js"
import { resolveRefs } from "../secrets/store.js"

type Connection = typeof connection.$inferSelect
type Json = Record<string, unknown>

const METHODS = ["get", "post", "put", "patch", "delete"] as const

type Param = { name: string; in: "path" | "query" | "header" }

// An OpenAPI operation, already shaped as an MCP tool.
export type Operation = {
  name: string
  method: string
  path: string
  description?: string
  params: Param[]
  hasBody: boolean
  inputSchema: Tool["inputSchema"]
}

// Accepts plain JSON or JSON wrapped in JS (e.g. window.swaggerSpec = {...}).
export function parseSpec(text: string): Json {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error("the spec is not JSON")
  const spec = JSON.parse(text.slice(start, end + 1)) as Json
  if (typeof spec.openapi !== "string" || !spec.paths)
    throw new Error("the spec is not OpenAPI 3 (missing openapi/paths)")
  return spec
}

export async function fetchSpec(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`spec: HTTP ${res.status}`)
  return parseSpec(await res.text())
}

// Inlines local $refs (#/components/...). Cycles stop at depth 20.
function deref(spec: Json, node: unknown, depth = 0): unknown {
  if (depth > 20 || node === null || typeof node !== "object") return node
  if (Array.isArray(node)) return node.map((n) => deref(spec, n, depth + 1))
  const ref = (node as Json).$ref
  if (typeof ref === "string" && ref.startsWith("#/")) {
    const target = ref
      .slice(2)
      .split("/")
      .reduce<unknown>((acc, key) => (acc as Json | undefined)?.[key], spec)
    return deref(spec, target, depth + 1)
  }
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, deref(spec, v, depth + 1)])
  )
}

// MCP tool names: letters, digits, _ and -, up to 64 characters.
// A valid operationId is kept; free text ("List Domains") becomes list_domains.
// Namespaced IDs (openapi.v2.OpenapiV2Service.CreateTask) keep only the last segment.
const toolName = (operationId: string) => {
  const raw = /^[\w.]+\.\w+$/.test(operationId)
    ? operationId.slice(operationId.lastIndexOf(".") + 1)
    : operationId
  return (/^[A-Za-z0-9_-]+$/.test(raw) ? raw : raw.toLowerCase())
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
}

// Security schemes of the spec that the connection's key satisfies:
// apiKey in the same header, or http bearer when the key goes in Authorization: Bearer.
function matchingSchemes(doc: Json, conn: Connection) {
  const schemes = ((doc.components as Json | undefined)?.securitySchemes ??
    {}) as Record<string, Json>
  const header = conn.authHeader?.toLowerCase()
  const bearer =
    header === "authorization" &&
    conn.authPrefix?.trim().toLowerCase() === "bearer"
  return new Set(
    Object.entries(schemes)
      .filter(
        ([, s]) =>
          (s.type === "apiKey" &&
            s.in === "header" &&
            String(s.name).toLowerCase() === header) ||
          (s.type === "http" &&
            String(s.scheme).toLowerCase() === "bearer" &&
            bearer)
      )
      .map(([name]) => name)
  )
}

// Operations of the connection's spec. If the key matches a security scheme, only
// operations accepting that scheme remain (login, sessions, admin etc. drop out).
// Specs that mark everything security: [] (e.g. Manus) would filter out all; then all count.
export function operations(conn: Connection): Operation[] {
  if (!conn.spec) return []
  const filtered = collect(conn, matchingSchemes(conn.spec as Json, conn))
  return filtered.length ? filtered : collect(conn, new Set())
}

function collect(conn: Connection, usable: Set<string>): Operation[] {
  const doc = conn.spec as Json
  const authNames = new Set(
    ["authorization", conn.authHeader?.toLowerCase()].filter(Boolean)
  )
  const ops: Operation[] = []
  for (const [path, item] of Object.entries(doc.paths as Json)) {
    const pathItem = deref(doc, item) as Json
    for (const method of METHODS) {
      const op = pathItem[method] as Json | undefined
      if (!op) continue
      const security = (op.security ?? doc.security ?? []) as Json[]
      if (
        usable.size &&
        !security.some((req) => Object.keys(req).some((k) => usable.has(k)))
      )
        continue
      const params = [
        ...((pathItem.parameters as Json[]) ?? []),
        ...((op.parameters as Json[]) ?? []),
      ].filter(
        (p): p is Json & Param =>
          ["path", "query", "header"].includes(p.in as string) &&
          // Auth headers declared as parameters: keyhall sets the key itself.
          !(p.in === "header" && authNames.has(String(p.name).toLowerCase()))
      )
      const content = (op.requestBody as Json | undefined)?.content as
        | Json
        | undefined
      const bodySchema = (content?.["application/json"] as Json | undefined)
        ?.schema as Json | undefined

      // Without parameters, the JSON body is the tool's argument; with parameters, it goes in "body".
      let inputSchema: Tool["inputSchema"]
      if (params.length === 0 && bodySchema?.type === "object") {
        inputSchema = { ...bodySchema, type: "object" }
      } else {
        const properties: Json = {}
        const required: string[] = []
        for (const p of params) {
          properties[p.name] = {
            ...((p.schema as Json) ?? { type: "string" }),
            description: p.description,
          }
          if (p.required || p.in === "path") required.push(p.name)
        }
        if (bodySchema) {
          properties.body = bodySchema
          if ((op.requestBody as Json).required) required.push("body")
        }
        inputSchema = {
          type: "object",
          properties: properties as Record<string, object>,
          required,
        }
      }

      const summary = [op.summary, op.description]
        .filter((t) => typeof t === "string" && t)
        .join("\n\n")
      ops.push({
        name: toolName(
          (op.operationId as string) ?? `${method}_${path.replace(/[{}]/g, "")}`
        ),
        method: method.toUpperCase(),
        path,
        description: `${summary}\n\n${method.toUpperCase()} ${path}`.trim(),
        params: params.map((p) => ({ name: p.name, in: p.in })),
        hasBody: !!bodySchema,
        inputSchema,
      })
    }
  }
  return ops
}

// Finds the spec operation matching an actual method + path.
export function matchOperation(ops: Operation[], method: string, path: string) {
  return ops.find((op) => {
    if (op.method !== method.toUpperCase()) return false
    const pattern = op.path
      .split(/\{[^}]+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]+")
    return new RegExp(`^${pattern}/?$`).test(path)
  })
}

// Builds the URL under the connection's base; refuses paths that escape it (.., absolute URL).
export function upstreamUrl(conn: Connection, path: string, search = "") {
  // Encoded separators or dot segments could be decoded by the upstream into a path outside
  // the base, so they're refused before the URL is built.
  const segments = path.split("/").map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })
  if (segments.some((s) => s === ".." || s === "." || /[/\\]/.test(s)))
    throw new Error("path outside the API")
  const base = new URL(conn.url)
  const basePath = base.pathname.replace(/\/$/, "")
  const url = new URL(`${basePath}/${path.replace(/^\/+/, "")}`, base.origin)
  if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`))
    throw new Error("path outside the API")
  url.search = search
  return url
}

export function authHeaders(conn: Connection) {
  // The key may be a vault reference ({{secret:NAME}}), resolved on every use.
  const raw = decrypt<string>(conn.secretEnc)
  const secret = raw && conn.projectId ? resolveRefs(raw, conn.projectId) : raw
  const headers = new Headers()
  if (secret && conn.authHeader)
    headers.set(conn.authHeader, `${conn.authPrefix ?? ""}${secret}`)
  return headers
}

// Runs an operation from the MCP tool's arguments.
export async function callOperation(
  conn: Connection,
  op: Operation,
  args: Json = {}
) {
  let path = op.path
  const query = new URLSearchParams()
  const headers = authHeaders(conn)
  for (const p of op.params) {
    const value = args[p.name]
    if (value === undefined || value === null) continue
    if (p.in === "path")
      path = path.replace(`{${p.name}}`, encodeURIComponent(String(value)))
    else if (p.in === "query") query.set(p.name, String(value))
    else if (!headers.has(p.name)) headers.set(p.name, String(value))
  }
  const body = op.params.length === 0 ? args : args.body
  if (op.hasBody) headers.set("content-type", "application/json")

  const res = await fetch(upstreamUrl(conn, path, query.toString()), {
    method: op.method,
    headers,
    body: op.hasBody ? JSON.stringify(body ?? {}) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  return {
    isError: !res.ok,
    content: [
      {
        type: "text" as const,
        text: res.ok ? text : `HTTP ${res.status}\n${text}`,
      },
    ],
  }
}
