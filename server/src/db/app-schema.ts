import { sql } from "drizzle-orm"
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
}

// Organization > projects > connections. Tokens target the organization, a project or a scope.
export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
})

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("project_org_slug_unique").on(t.orgId, t.slug)]
)

// An upstream: remote MCP server (OAuth or fixed headers), HTTP API (fixed key) or local MCP server
// (stdio, a process keyhall starts). *Enc fields are encrypted with crypto.ts.
export const connection = sqliteTable(
  "connection",
  {
    id: text("id").primaryKey(),
    // Null only in databases older than projects; the migration fills it in.
    projectId: text("project_id").references(() => project.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["mcp", "api", "stdio"] })
      .default("mcp")
      .notNull(),
    // mcp: server endpoint. api: base URL, prepended to the spec's paths.
    // stdio: display only (command and arguments).
    url: text("url").notNull(),
    status: text("status", { enum: ["pending", "connected", "error"] })
      .default("pending")
      .notNull(),
    lastError: text("last_error"),
    oauthState: text("oauth_state"),
    clientInfoEnc: text("client_info_enc"),
    tokensEnc: text("tokens_enc"),
    codeVerifierEnc: text("code_verifier_enc"),
    discoveryEnc: text("discovery_enc"),
    // kind = api only: header that carries the key (e.g. Authorization) and prefix (e.g. "Bearer ").
    authHeader: text("auth_header"),
    authPrefix: text("auth_prefix"),
    // api: the key. stdio: the environment { NAME: value }. mcp: fixed headers
    // { Name: value } sent on every request (a fixed Authorization replaces OAuth).
    secretEnc: text("secret_enc"),
    // OpenAPI 3 spec (JSON): each operation becomes an MCP tool.
    specUrl: text("spec_url"),
    spec: text("spec", { mode: "json" }).$type<unknown>(),
    // kind = stdio only: command and arguments (mcpServers format). The environment
    // variables are encrypted in secretEnc, as an object { NAME: value }.
    command: text("command"),
    args: text("args", { mode: "json" }).$type<string[]>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("connection_project_slug_unique").on(t.projectId, t.slug)]
)

// A chosen set of connections and tools. Null projectId = organization scope,
// which may combine connections from different projects.
export const scope = sqliteTable(
  "scope",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organization.id),
    projectId: text("project_id").references(() => project.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("scope_org_slug_unique").on(t.orgId, t.slug)]
)

// allowedTools: JSON list of allowed tools; null = all.
export const scopeConnection = sqliteTable(
  "scope_connection",
  {
    scopeId: text("scope_id")
      .notNull()
      .references(() => scope.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    allowedTools: text("allowed_tools", { mode: "json" }).$type<
      string[] | null
    >(),
  },
  (t) => [primaryKey({ columns: [t.scopeId, t.connectionId] })]
)

// Vault: values stored in keyhall. Each version has its own key (envelope): the value is
// encrypted with a random key, and that key with the master key. Rotating the master key
// only re-encrypts the version keys. agentAccess allows reads through MCP (the value enters
// the model's context); through REST, the token's reach is enough.
export const secret = sqliteTable(
  "secret",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id),
    name: text("name").notNull(),
    description: text("description"),
    agentAccess: integer("agent_access", { mode: "boolean" })
      .default(false)
      .notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("secret_project_name_unique").on(t.projectId, t.name)]
)

export const secretVersion = sqliteTable(
  "secret_version",
  {
    secretId: text("secret_id")
      .notNull()
      .references(() => secret.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    valueEnc: text("value_enc").notNull(),
    keyEnc: text("key_enc").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.secretId, t.version] })]
)

// Secrets a scope may read (project and organization tokens reach all of theirs).
export const scopeSecret = sqliteTable(
  "scope_secret",
  {
    scopeId: text("scope_id")
      .notNull()
      .references(() => scope.id, { onDelete: "cascade" }),
    secretId: text("secret_id")
      .notNull()
      .references(() => secret.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.scopeId, t.secretId] })]
)

// Read log: who read which version, and how (REST, MCP or panel).
export const secretAccess = sqliteTable("secret_access", {
  id: text("id").primaryKey(),
  secretId: text("secret_id")
    .notNull()
    .references(() => secret.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  via: text("via", { enum: ["rest", "mcp", "panel"] }).notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamps.createdAt,
})
