export type Project = { id: string; orgId: string; slug: string; name: string }

export type Org = {
  id: string
  slug: string
  name: string
  projects: Project[]
}

// What the panel shows: the whole organization or one of its projects.
export type View = { org: Org; project: Project | null }

// Panel text in each language (catalog entries and native plugin fields).
export type Text = { en: string; pt: string }

export type CatalogOAuthClient = {
  vaultName: string
  consoleUrl: string
  guide?: string
  links?: { label: Text; url: string }[]
}

export type CatalogConnect =
  | {
      kind: "mcp"
      url: string
      key?: {
        header: string
        prefix: string
        label: Text
        url?: string
        placeholder?: string
        optional?: boolean
        endpoint?: string
      }
      oauthClient?: CatalogOAuthClient
    }
  | {
      kind: "stdio"
      command: string
      args: string[]
      key: { env: string; label: Text; url?: string; placeholder?: string }
    }
  | {
      kind: "native"
      plugin: string
      features: string[]
      guide?: string
      links?: { label: Text; url: string }[]
    }

export type CatalogEntry = {
  slug: string
  name: string
  icon: string | null
  category: string
  tagline: Text
  website: string
  connect: CatalogConnect
}

export type NativeSpec = {
  fields: {
    name: string
    label: Text
    secret?: boolean
    placeholder?: string
    // Suffix in the vault: <client name>_<vault>.
    vault: string
  }[]
  features: { id: string; label: Text; hint: Text }[]
  // Default client name, and where the provider's OAuth clients are created.
  vaultName: string
  consoleUrl: string
}

export type Catalog = {
  entries: CatalogEntry[]
  native: Record<string, NativeSpec>
}

export type Connection = {
  id: string
  projectId: string
  slug: string
  name: string
  kind: "mcp" | "api" | "stdio" | "native"
  url: string
  authHeader: string | null
  authPrefix: string | null
  specUrl: string | null
  // Where the API's tools come from: a URL fetched on save, or an uploaded file.
  specSource: "url" | "file" | null
  hasSecret: boolean
  // The API key, when it's a vault reference ({{secret:NAME}}).
  secretRef: string | null
  // Environment variables that are vault references.
  envRefs: Record<string, string>
  command: string | null
  args: string[] | null
  envNames: string[]
  // Remote MCP: names of the fixed headers, and the values that are vault references
  // (optionally after a scheme: "Bearer {{secret:KEY}}").
  headerNames: string[]
  headerRefs: Record<string, string>
  // Remote MCP with a static OAuth client (for servers without dynamic client registration).
  oauthClient: {
    clientId: string
    clientSecretRef: string | null
    hasSecret: boolean
  } | null
  // Catalog entry the connection came from (null = custom).
  plugin: string | null
  // Native plugin: field values (secret ones only as vault references), features on, and the
  // signed-in account.
  native: {
    native: string
    fields: Record<string, string | null>
    features: string[]
    account: string | null
  } | null
  status: "pending" | "connected" | "error"
  lastError: string | null
  // Tools that wait for an admin's approval on each call.
  approvalTools: string[]
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
  skillIds: string[]
  // Per connection: allowed tools; null = all.
  allowedTools: Record<string, string[] | null>
}

export type SkillFile = {
  path: string
  content: string
  mimeType?: string
}

export type Skill = {
  id: string
  projectId: string
  slug: string
  activeVersion: string
  latestVersion: string
  versionCount: number
  description: string
  fileCount: number
  digest: string
  createdAt: string
  updatedAt: string
}

export type SkillVersionSummary = {
  version: string
  seq: number
  description: string
  changelog: string | null
  fileCount: number
  digest: string
  size: number
  createdBy: string | null
  createdAt: string
}

export type SkillVersionDetail = SkillVersionSummary & {
  body: string
  frontmatterExtra: Record<string, unknown> | null
  files: SkillFile[]
  renderedSkillMd: string
}

export type SkillDetail = Skill & {
  active: SkillVersionDetail | null
  versions: SkillVersionSummary[]
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
  // "member": everything granted to a member (their own tokens).
  target: { kind: "org" | "project" | "scope" | "member"; id: string }
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

// A person invited to an organization, with what they were granted.
export type Member = {
  id: string
  orgId: string
  email: string
  name: string | null
  status: "invited" | "expired" | "active"
  inviteExpires: string | null
  joinedAt: string | null
  createdAt: string
  // Per connection: allowed tools; null = all.
  connections: Record<string, string[] | null>
  scopeIds: string[]
  secretIds: string[]
  skillIds: string[]
}

// The member's side: what was granted in each organization (names only, no credentials).
export type Reach = {
  memberId: string
  org: { id: string; name: string; slug: string }
  connections: {
    id: string
    name: string
    slug: string
    kind: Connection["kind"]
    plugin: string | null
    status: Connection["status"]
    project: { name: string; slug: string }
    allowedTools: string[] | null
  }[]
  scopes: { id: string; name: string; slug: string }[]
  secrets: {
    id: string
    name: string
    description: string | null
    agentAccess: boolean
    project: { name: string; slug: string }
  }[]
}

// A call waiting for (or decided by) an admin.
export type Approval = {
  id: string
  tool: string
  exposedName: string
  args: unknown
  tokenName: string
  requestedBy: string
  status: "pending" | "approved" | "denied" | "used" | "expired"
  decidedBy: string | null
  decidedAt: string | null
  expiresAt: string
  createdAt: string
  connection: { id: string; name: string }
  project: { id: string; orgId: string; name: string }
}

export type ApiClient = <T = void>(
  path: string,
  init?: { method?: string; body?: unknown }
) => Promise<T>

const client =
  (prefix: string): ApiClient =>
  async <T = void>(
    path: string,
    init?: { method?: string; body?: unknown }
  ) => {
    const res = await fetch(`${prefix}${path}`, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `erro ${res.status}`)
    }
    return (res.status === 204 ? undefined : res.json()) as Promise<T>
  }

// A member's own API (their reach and tokens).
export const meApi = client("/api/me")

export const api = client("/api/admin")
