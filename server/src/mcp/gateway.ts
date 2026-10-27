import { createHash } from "node:crypto"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import type { Access, Link, ToolMode } from "../access.js"
import { callOperation, operations } from "../api/openapi.js"
import {
  currentValue,
  logAccess,
  pick,
  type Reachable,
  reachableSecrets,
} from "../secrets/store.js"
import { callCodeMode, codeModeTools } from "./code-mode.js"
import { withUpstream } from "./upstream.js"

export const allowed = (list: string[] | null, tool: string) =>
  list === null || list.includes(tool)

// Clients add their own prefix (Claude Code uses mcp__keyhall__, 14 characters) and the Claude
// API rejects names over 64. Long names are shortened with a hash of the original name.
const MAX_NAME = 50

export function exposedName(prefix: string, tool: string) {
  const full = `${prefix}${tool}`
  if (full.length <= MAX_NAME) return full
  const hash = createHash("sha256").update(tool).digest("hex").slice(0, 6)
  return `${prefix}${tool.slice(0, Math.max(1, MAX_NAME - prefix.length - 7))}_${hash}`
}

// Code Mode searches the catalog on every call, so upstream lists are kept for a minute.
// A change to the connection (new tokens, a new spec) starts a fresh list.
const LIST_TTL_MS = 60_000
const listCache = new Map<string, { key: number; at: number; tools: Tool[] }>()

async function upstreamTools(link: Link): Promise<Tool[]> {
  if (link.conn.kind === "api")
    return operations(link.conn).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }))
  const key = link.conn.updatedAt.getTime()
  const hit = listCache.get(link.conn.id)
  if (hit && hit.key === key && Date.now() - hit.at < LIST_TTL_MS)
    return hit.tools
  const { tools } = await withUpstream(link.conn, (client) =>
    client.listTools()
  )
  listCache.set(link.conn.id, { key, at: Date.now(), tools })
  return tools
}

const denied = (name: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Tool not allowed: ${name}` }],
})

// Vault tools. They only appear when the token reaches a secret readable by agents;
// the value enters the model's context, so every read is logged.
const LIST_SECRETS = "keyhall__list_secrets"
const GET_SECRET = "keyhall__get_secret"

function secretTools(multi: boolean): Tool[] {
  const project: Record<string, object> = multi
    ? {
        project: {
          type: "string",
          description:
            "Project slug, when the same name exists in several projects",
        },
      }
    : {}
  return [
    {
      name: LIST_SECRETS,
      description:
        "List the secrets stored in keyhall that you may read: name, project and description. Values are not included.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: GET_SECRET,
      description:
        "Read the current value of a secret stored in keyhall. Every read is logged. Only use it when a task really needs the value.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, ...project },
        required: ["name"],
      },
    },
  ]
}

async function callSecretTool(
  name: string,
  args: Record<string, unknown> | undefined,
  secrets: Reachable[],
  actor: string
) {
  const text = (value: unknown) => ({
    content: [
      {
        type: "text" as const,
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  })
  if (name === LIST_SECRETS)
    return text(
      secrets.map((r) => ({
        name: r.secret.name,
        project: r.project.slug,
        description: r.secret.description,
      }))
    )
  const result = pick(
    secrets,
    String(args?.name ?? ""),
    args?.project ? String(args.project) : undefined
  )
  if (!result.found) return { isError: true, ...text(result.error) }
  await logAccess(result.found.secret, "mcp", actor)
  return text(currentValue(result.found.secret))
}

// Every tool the token reaches, with the names consumers call. full keeps long names whole
// (Code Mode passes them inside code, where the client's 64-character limit doesn't apply).
async function catalog(
  access: Access,
  agentSecrets: Reachable[],
  full = false
): Promise<Tool[]> {
  const results = await Promise.allSettled(
    access.links
      .filter((l) => l.conn.status === "connected")
      .map(async (link) =>
        (await upstreamTools(link))
          .filter((t) => allowed(link.allowedTools, t.name))
          .map(
            (t): Tool => ({
              ...t,
              name: full
                ? `${link.prefix}${t.name}`
                : exposedName(link.prefix, t.name),
            })
          )
      )
  )
  const tools: Tool[] = agentSecrets.length
    ? secretTools(new Set(agentSecrets.map((r) => r.project.id)).size > 1)
    : []
  for (const r of results) {
    if (r.status === "fulfilled") tools.push(...r.value)
    else console.error("upstream failed on tools/list:", r.reason)
  }
  return tools
}

async function callTool(
  access: Access,
  agentSecrets: Reachable[],
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  if (agentSecrets.length && (name === LIST_SECRETS || name === GET_SECRET))
    return callSecretTool(
      name,
      args,
      agentSecrets,
      `token ${access.token.name}`
    )
  // The prefix ends in "__", so only one connection matches.
  const link = access.links.find((l) => name.startsWith(l.prefix))
  if (!link) return denied(name)
  let tool = name.slice(link.prefix.length)
  if (`${link.prefix}${tool}`.length >= MAX_NAME) {
    // It may be a shortened name: find the original with the same rule.
    const match = (await upstreamTools(link)).find(
      (t) => exposedName(link.prefix, t.name) === name
    )
    if (match) tool = match.name
  }
  if (!allowed(link.allowedTools, tool)) return denied(name)

  if (link.conn.kind === "api") {
    const op = operations(link.conn).find((o) => o.name === tool)
    if (!op) return denied(name)
    return callOperation(link.conn, op, args)
  }
  return withUpstream(
    link.conn,
    (client) =>
      client.callTool({
        name: tool,
        arguments: args,
      }) as Promise<CallToolResult>
  )
}

function buildServer(
  access: Access,
  agentSecrets: Reachable[],
  mode: ToolMode
) {
  const server = new Server(
    { name: "keyhall", version: "0.2.0" },
    { capabilities: { tools: {} } }
  )

  if (mode === "code") {
    const ctx = {
      catalog: () => catalog(access, agentSecrets, true),
      call: (name: string, args: Record<string, unknown> | undefined) =>
        callTool(access, agentSecrets, name, args),
      connections: access.links
        .filter((l) => l.conn.status === "connected")
        .map((l) => ({ prefix: l.prefix, name: l.conn.name })),
      secrets: agentSecrets.length > 0,
    }
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: codeModeTools(ctx),
    }))
    server.setRequestHandler(CallToolRequestSchema, (req) =>
      callCodeMode(ctx, req.params.name, req.params.arguments)
    )
    return server
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await catalog(access, agentSecrets),
  }))
  server.setRequestHandler(CallToolRequestSchema, (req) =>
    callTool(access, agentSecrets, req.params.name, req.params.arguments)
  )
  return server
}

// Stateless mode: one server and one transport per request, as in the SDK's official example.
export async function handleMcp(access: Access, req: Request) {
  const agentSecrets = (await reachableSecrets(access.target)).filter(
    (r) => r.secret.agentAccess
  )
  const server = buildServer(access, agentSecrets, access.mode)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(req)
}
