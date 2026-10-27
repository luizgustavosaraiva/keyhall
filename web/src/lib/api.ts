export type Project = { id: string; orgId: string; slug: string; name: string }

export type Org = {
  id: string
  slug: string
  name: string
  projects: Project[]
}

// What the panel shows: the whole organization or one of its projects.
export type View = { org: Org; project: Project | null }

export type Connection = {
  id: string
  projectId: string
  slug: string
  name: string
  kind: "mcp" | "api" | "stdio"
  url: string
  authHeader: string | null
  authPrefix: string | null
  specUrl: string | null
  hasSecret: boolean
  // The API key, when it's a vault reference ({{secret:NAME}}).
  secretRef: string | null
  // Environment variables that are vault references.
  envRefs: Record<string, string>
  command: string | null
  args: string[] | null
  envNames: string[]
  status: "pending" | "connected" | "error"
  lastError: string | null
}

export type Scope = {
  id: string
  orgId: string
  // null = organization scope, with connections from several projects.
  projectId: string | null
  slug: string
  name: string
  connectionIds: string[]
  secretIds: string[]
  // Per connection: allowed tools; null = all.
  allowedTools: Record<string, string[] | null>
}

export type Secret = {
  id: string
  projectId: string
  name: string
  description: string | null
  // Readable through MCP (the value enters the model's context).
  agentAccess: boolean
  version: number
  createdAt: string
  updatedAt: string
  // Connections that reference the secret.
  usedBy: string[]
}

export type SecretHistory = {
  versions: { version: number; createdBy: string | null; createdAt: string }[]
  reads: {
    version: number
    via: "rest" | "mcp" | "panel"
    actor: string
    createdAt: string
  }[]
}

export type ToolParam = {
  type?: string | string[]
  description?: string
  enum?: unknown[]
  items?: { type?: string }
}

export type Tool = {
  name: string
  description?: string
  // JSON Schema of the arguments (included in the panel's listings).
  inputSchema?: {
    properties?: Record<string, ToolParam>
    required?: string[]
  }
}

export type Token = {
  id: string
  name: string | null
  start: string | null
  target: { kind: "org" | "project" | "scope"; id: string }
  // "code": the client sees search and execute (Code Mode); "tools": every tool.
  mode: "tools" | "code"
  expiresAt: string | null
  lastRequest: string | null
  createdAt: string
}

export type ConnectResult =
  | { status: "connected" }
  | { status: "authorize"; authorizationUrl: string }
  | { status: "error"; error: string }

export async function api<T = void>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `erro ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
