import { createHash } from "node:crypto"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import type { Access, Link } from "../access.js"
import { callOperation, operations } from "../api/openapi.js"
import {
  currentValue,
  logAccess,
  pick,
  type Reachable,
  reachableSecrets,
} from "../secrets/store.js"
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

async function upstreamTools(link: Link): Promise<Tool[]> {
  if (link.conn.kind === "api")
    return operations(link.conn).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }))
  return (await withUpstream(link.conn, (client) => client.listTools())).tools
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

function buildServer(access: Access, agentSecrets: Reachable[]) {
  const { links } = access
  const server = new Server(
    { name: "keyhall", version: "0.2.0" },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const results = await Promise.allSettled(
      links
        .filter((l) => l.conn.status === "connected")
        .map(async (link) =>
          (await upstreamTools(link))
            .filter((t) => allowed(link.allowedTools, t.name))
            .map(
              (t): Tool => ({ ...t, name: exposedName(link.prefix, t.name) })
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
    return { tools }
  })

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name
    if (agentSecrets.length && (name === LIST_SECRETS || name === GET_SECRET))
      return callSecretTool(
        name,
        req.params.arguments,
        agentSecrets,
        `token ${access.token.name}`
      )
    // The prefix ends in "__", so only one connection matches.
    const link = links.find((l) => name.startsWith(l.prefix))
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
      return callOperation(link.conn, op, req.params.arguments)
    }
    return withUpstream(link.conn, (client) =>
      client.callTool({ name: tool, arguments: req.params.arguments })
    )
  })

  return server
}

// Stateless mode: one server and one transport per request, as in the SDK's official example.
export async function handleMcp(access: Access, req: Request) {
  const agentSecrets = (await reachableSecrets(access.target)).filter(
    (r) => r.secret.agentAccess
  )
  const server = buildServer(access, agentSecrets)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(req)
}
