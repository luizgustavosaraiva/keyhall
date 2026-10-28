import { randomUUID } from "node:crypto"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import { toolMode } from "../access.js"
import { fetchSpec, operations } from "../api/openapi.js"
import { auth } from "../auth.js"
import { decrypt, encrypt } from "../crypto.js"
import { db } from "../db/index.js"
import {
  connection,
  organization,
  project,
  scope,
  scopeConnection,
  scopeSecret,
  secret,
} from "../db/schema.js"
import { ConnectionOAuthProvider } from "../mcp/oauth-provider.js"
import { stdioAllowed, stopStdio } from "../mcp/stdio.js"
import { hasAuthHeader, withUpstream } from "../mcp/upstream.js"
import { missingRefs, refsIn } from "../secrets/store.js"
import { type AdminEnv, requireAdmin } from "./middleware.js"

// Slugs become tool prefixes and URL parts: no "__" and no uppercase.
export const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "use lowercase letters, numbers and hyphens"
  )

const httpUrl = z.url({ protocol: /^https?$/ })

// "keyhall" is the prefix of keyhall's own tools (vault).
const connectionSlug = slug.refine(
  (v) => v !== "keyhall",
  "keyhall is reserved"
)

// {{secret:…}} references that don't exist in the project (or the organization).
const badRefs = (values: string[], projectId: string) =>
  values.flatMap((v) => missingRefs(v, projectId))
const refError = (names: string[]) =>
  `secret not found: ${[...new Set(names)].join(", ")}`

// A value that is only a vault reference (may go to the panel; it's not secret).
const WHOLE_REF = /^\{\{\s*secret:[^}]+\}\}$/
const asRef = (value: string | undefined) =>
  value && WHOLE_REF.test(value.trim()) ? value.trim() : null

// A header value that is a reference, optionally after an auth scheme ("Bearer {{secret:KEY}}").
const SCHEME_REF = /^(?:[A-Za-z]+ )?\{\{\s*secret:[^}]+\}\}$/
const asSchemeRef = (value: string) =>
  SCHEME_REF.test(value.trim()) ? value.trim() : null

// API connection fields that can change later (the key never goes back to the panel).
const apiFields = z.object({
  authHeader: z.string().min(1).default("Authorization"),
  authPrefix: z.string().default("Bearer "),
  secret: z.string().min(1),
  specUrl: httpUrl.optional(),
})

// Local MCP server in the mcpServers format (Claude Code, Claude Desktop, Cursor):
// { command, args, env }. env values are encrypted.
const stdioFields = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z
    .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string())
    .default({}),
})

// Fixed headers sent to a remote MCP server on every request, e.g. a key in Authorization
// for servers that don't use OAuth. Values are encrypted and may hold vault references.
const headerName = z
  .string()
  .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, "invalid header name")
const remoteHeaders = z
  .record(headerName, z.string())
  .refine(
    (h) =>
      new Set(Object.keys(h).map((k) => k.toLowerCase())).size ===
      Object.keys(h).length,
    "duplicate header"
  )

// Display line: the command as it would be typed.
const commandLine = (command: string, args: string[]) =>
  [command, ...args].join(" ")

const connectionInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mcp").default("mcp"),
    projectId: z.string().min(1),
    name: z.string().min(1),
    slug: connectionSlug,
    url: httpUrl,
    headers: remoteHeaders
      .refine((h) => Object.values(h).every(Boolean), "header without a value")
      .default({}),
  }),
  apiFields.extend({
    kind: z.literal("api"),
    projectId: z.string().min(1),
    name: z.string().min(1),
    slug: connectionSlug,
    url: httpUrl,
  }),
  stdioFields.extend({
    kind: z.literal("stdio"),
    projectId: z.string().min(1),
    name: z.string().min(1),
    slug: connectionSlug,
  }),
])

const scopeInput = z.object({
  orgId: z.string().min(1),
  // null = organization scope (may combine connections from different projects).
  projectId: z.string().min(1).nullable(),
  name: z.string().min(1),
  slug,
  connectionIds: z.array(z.string()).default([]),
  secretIds: z.array(z.string()).default([]),
  // Per connection: allowed tools. Missing or null = all.
  allowedTools: z
    .record(z.string(), z.array(z.string()).nullable())
    .default({}),
})

const tokenInput = z.object({
  name: z.string().min(1),
  target: z.object({
    kind: z.enum(["org", "project", "scope"]),
    id: z.string().min(1),
  }),
  expiresInDays: z.number().int().positive().optional(),
  mode: z.enum(["tools", "code"]).default("tools"),
})

const nameSlug = z.object({ name: z.string().min(1), slug })

// Renaming changes only the display name; the slug stays, since tool names use it.
const rename = z.object({ name: z.string().trim().min(1) })

// Stored connection texts that may hold {{secret:…}} references.
function storedRefs(c: typeof connection.$inferSelect) {
  if (c.kind === "api") return [decrypt<string>(c.secretEnc) ?? ""]
  return Object.values(decrypt<Record<string, string>>(c.secretEnc) ?? {})
}

// stdio env or remote MCP headers: names, and the values that are only a vault reference.
function namedValues(c: typeof connection.$inferSelect) {
  const values =
    c.kind === "api" ? {} : (decrypt<Record<string, string>>(c.secretEnc) ?? {})
  return {
    names: Object.keys(values),
    refs: Object.fromEntries(
      Object.entries(values)
        .map(([k, v]) => [k, c.kind === "mcp" ? asSchemeRef(v) : asRef(v)])
        .filter(([, v]) => v)
    ),
  }
}

const publicConnection = (c: typeof connection.$inferSelect) => {
  const named = namedValues(c)
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    kind: c.kind,
    projectId: c.projectId,
    url: c.url,
    authHeader: c.authHeader,
    authPrefix: c.authPrefix,
    specUrl: c.specUrl,
    hasSecret: !!c.secretEnc,
    // Vault references aren't secret: they go back to the panel to fill the edit form.
    secretRef:
      c.kind === "api"
        ? asRef(decrypt<string>(c.secretEnc) ?? undefined)
        : null,
    envRefs: c.kind === "stdio" ? named.refs : {},
    command: c.command,
    args: c.args,
    // Variable and header names only; values never go back to the panel.
    envNames: c.kind === "stdio" ? named.names : [],
    headerNames: c.kind === "mcp" ? named.names : [],
    headerRefs: c.kind === "mcp" ? named.refs : {},
    status: c.status,
    lastError: c.lastError,
    createdAt: c.createdAt,
  }
}

// Connections a scope may include: its project's, or any project's in the organization.
async function outOfReach(
  orgId: string,
  projectId: string | null,
  connectionIds: string[]
) {
  if (!connectionIds.length) return []
  const rows = await db
    .select({
      id: connection.id,
      projectId: connection.projectId,
      orgId: project.orgId,
    })
    .from(connection)
    .innerJoin(project, eq(connection.projectId, project.id))
    .where(inArray(connection.id, connectionIds))
  const ok = new Set(
    rows
      .filter(
        (r) => r.orgId === orgId && (!projectId || r.projectId === projectId)
      )
      .map((r) => r.id)
  )
  return connectionIds.filter((id) => !ok.has(id))
}

// Secrets a scope may include: its project's, or any project's in the organization.
async function secretsOutOfReach(
  orgId: string,
  projectId: string | null,
  secretIds: string[]
) {
  if (!secretIds.length) return []
  const rows = await db
    .select({
      id: secret.id,
      projectId: secret.projectId,
      orgId: project.orgId,
    })
    .from(secret)
    .innerJoin(project, eq(secret.projectId, project.id))
    .where(inArray(secret.id, secretIds))
  const ok = new Set(
    rows
      .filter(
        (r) => r.orgId === orgId && (!projectId || r.projectId === projectId)
      )
      .map((r) => r.id)
  )
  return secretIds.filter((id) => !ok.has(id))
}

// Connections using a secret (by reference), for the panel and to block deletion.
export async function connectionsUsing(s: typeof secret.$inferSelect) {
  const rows = await db.select().from(connection)
  const projects = await db.select().from(project)
  const of = (id: string | null) => projects.find((p) => p.id === id)
  const home = of(s.projectId)
  return rows.filter(
    (c) =>
      of(c.projectId)?.orgId === home?.orgId &&
      storedRefs(c).some((text) =>
        refsIn(text).some(
          (r) =>
            r.name === s.name &&
            (r.project ? r.project === home?.slug : c.projectId === s.projectId)
        )
      )
  )
}

async function getConnection(id: string) {
  const [c] = await db.select().from(connection).where(eq(connection.id, id))
  return c
}

// API: (re)downloads the spec, if there's a URL. The key is only tested on use.
async function connectApi(conn: typeof connection.$inferSelect) {
  try {
    const spec = conn.specUrl ? await fetchSpec(conn.specUrl) : conn.spec
    await db
      .update(connection)
      .set({ spec, status: "connected", lastError: null })
      .where(eq(connection.id, conn.id))
    return { status: "connected" as const }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(connection)
      .set({ status: "error", lastError: message })
      .where(eq(connection.id, conn.id))
    return { status: "error" as const, error: message }
  }
}

// stdio: starts the process and lists tools to check it answers.
async function connectStdio(conn: typeof connection.$inferSelect) {
  try {
    await withUpstream(conn, (client) => client.listTools())
    await db
      .update(connection)
      .set({ status: "connected", lastError: null })
      .where(eq(connection.id, conn.id))
    return { status: "connected" as const }
  } catch (err) {
    stopStdio(conn.id)
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(connection)
      .set({ status: "error", lastError: message })
      .where(eq(connection.id, conn.id))
    return { status: "error" as const, error: message }
  }
}

// Tries to open a session with the upstream. If it asks for OAuth, returns the authorization URL.
async function connect(conn: typeof connection.$inferSelect) {
  if (conn.kind === "api") return connectApi(conn)
  if (conn.kind === "stdio") return connectStdio(conn)
  const provider = new ConnectionOAuthProvider(conn)
  // OAuth client registered with another callback (keyhall changed host): register again.
  const info = provider.clientInformation()
  if (
    info &&
    "redirect_uris" in info &&
    !info.redirect_uris.includes(provider.redirectUrl)
  ) {
    await provider.invalidateCredentials("all")
  }
  try {
    await withUpstream(conn, async () => {}, provider)
    await db
      .update(connection)
      .set({ status: "connected", lastError: null })
      .where(eq(connection.id, conn.id))
    return { status: "connected" as const }
  } catch (err) {
    // On 401 the transport has already registered the client and built the authorization URL.
    if (err instanceof UnauthorizedError && provider.authorizationUrl) {
      return {
        status: "authorize" as const,
        authorizationUrl: provider.authorizationUrl.toString(),
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(connection)
      .set({ status: "error", lastError: message })
      .where(eq(connection.id, conn.id))
    return { status: "error" as const, error: message }
  }
}

export const admin = new Hono<AdminEnv>()
  .use(requireAdmin)

  // What this instance allows; the panel hides what's disabled.
  .get("/settings", (c) => c.json({ stdio: stdioAllowed }))

  // Organizations and projects
  .get("/orgs", async (c) => {
    const orgs = await db.select().from(organization).orderBy(organization.name)
    const projects = await db.select().from(project).orderBy(project.name)
    return c.json(
      orgs.map((o) => ({
        ...o,
        projects: projects.filter((p) => p.orgId === o.id),
      }))
    )
  })
  .post("/orgs", async (c) => {
    const input = nameSlug.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const [dup] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, input.data.slug))
    if (dup)
      return c.json(
        { error: `organization ${input.data.slug} already exists` },
        409
      )
    const [row] = await db
      .insert(organization)
      .values({ id: randomUUID(), ...input.data })
      .returning()
    return c.json(row, 201)
  })
  .patch("/orgs/:id", async (c) => {
    const input = rename.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const [row] = await db
      .update(organization)
      .set(input.data)
      .where(eq(organization.id, c.req.param("id")))
      .returning()
    if (!row) return c.json({ error: "organization not found" }, 404)
    return c.json(row)
  })
  .delete("/orgs/:id", async (c) => {
    const id = c.req.param("id")
    const orgs = await db.select({ id: organization.id }).from(organization)
    if (orgs.length <= 1)
      return c.json({ error: "keyhall needs at least one organization" }, 409)
    const [p] = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.orgId, id))
    const [sc] = await db
      .select({ id: scope.id })
      .from(scope)
      .where(eq(scope.orgId, id))
    if (p || sc)
      return c.json(
        {
          error:
            "the organization still has projects or scopes; delete them first",
        },
        409
      )
    await db.delete(organization).where(eq(organization.id, id))
    return c.body(null, 204)
  })
  .patch("/projects/:id", async (c) => {
    const input = rename.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const [row] = await db
      .update(project)
      .set(input.data)
      .where(eq(project.id, c.req.param("id")))
      .returning()
    if (!row) return c.json({ error: "project not found" }, 404)
    return c.json(row)
  })
  .post("/orgs/:id/projects", async (c) => {
    const input = nameSlug.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const orgId = c.req.param("id")
    const [dup] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.orgId, orgId), eq(project.slug, input.data.slug)))
    if (dup)
      return c.json({ error: `project ${input.data.slug} already exists` }, 409)
    const [row] = await db
      .insert(project)
      .values({ id: randomUUID(), orgId, ...input.data })
      .returning()
    return c.json(row, 201)
  })
  .delete("/projects/:id", async (c) => {
    const id = c.req.param("id")
    const [conn] = await db
      .select({ id: connection.id })
      .from(connection)
      .where(eq(connection.projectId, id))
    const [sc] = await db
      .select({ id: scope.id })
      .from(scope)
      .where(eq(scope.projectId, id))
    const [sec] = await db
      .select({ id: secret.id })
      .from(secret)
      .where(eq(secret.projectId, id))
    if (conn || sc || sec)
      return c.json(
        {
          error:
            "the project still has connections, scopes or secrets; move or delete them first",
        },
        409
      )
    await db.delete(project).where(eq(project.id, id))
    return c.body(null, 204)
  })

  // Connections
  .get("/connections", async (c) => {
    const rows = await db.select().from(connection).orderBy(connection.name)
    return c.json(rows.map(publicConnection))
  })
  .post("/connections", async (c) => {
    const input = connectionInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    if (input.data.kind === "stdio" && !stdioAllowed)
      return c.json(
        { error: "local connections are disabled (KEYHALL_ALLOW_STDIO=false)" },
        403
      )
    const [dup] = await db
      .select({ id: connection.id })
      .from(connection)
      .where(
        and(
          eq(connection.projectId, input.data.projectId),
          eq(connection.slug, input.data.slug)
        )
      )
    if (dup)
      return c.json(
        {
          error: `a connection with identifier ${input.data.slug} already exists in this project`,
        },
        409
      )
    const data = input.data
    const refs =
      data.kind === "api"
        ? [data.secret]
        : Object.values(data.kind === "stdio" ? data.env : data.headers)
    const missing = badRefs(refs, data.projectId)
    if (missing.length) return c.json({ error: refError(missing) }, 400)
    const values =
      data.kind === "api"
        ? (({ secret, ...rest }) => ({ ...rest, secretEnc: encrypt(secret) }))(
            data
          )
        : data.kind === "stdio"
          ? (({ env, ...rest }) => ({
              ...rest,
              url: commandLine(rest.command, rest.args),
              secretEnc: encrypt(env),
            }))(data)
          : (({ headers, ...rest }) => ({
              ...rest,
              secretEnc: Object.keys(headers).length ? encrypt(headers) : null,
            }))(data)
    const [row] = await db
      .insert(connection)
      .values({ id: randomUUID(), ...values })
      .returning()
    // API with a spec, stdio and remote MCP with a fixed key come out connected (or with the
    // error). Remote MCP with OAuth waits for the administrator to authorize.
    if (
      row.kind !== "mcp" ||
      (data.kind === "mcp" && hasAuthHeader(data.headers))
    )
      await connect(row)
    return c.json(publicConnection((await getConnection(row.id)) ?? row), 201)
  })
  // Changes the key, header or spec of an API connection, or the command and env of a
  // stdio one, without removing it from scopes.
  .patch("/connections/:id", async (c) => {
    const conn = await getConnection(c.req.param("id"))
    if (!conn) return c.json({ error: "connection not found" }, 404)
    if (conn.kind === "stdio") {
      const input = stdioFields
        .partial()
        .extend({ name: z.string().min(1).optional() })
        .safeParse(await c.req.json())
      if (!input.success)
        return c.json({ error: z.prettifyError(input.error) }, 400)
      const { env, ...rest } = input.data
      const command = rest.command ?? conn.command ?? ""
      const args = rest.args ?? conn.args ?? []
      // An empty value keeps the current one; a missing variable is removed.
      const current = decrypt<Record<string, string>>(conn.secretEnc) ?? {}
      const nextEnv = env
        ? Object.fromEntries(
            Object.entries(env).map(([k, v]) => [k, v || current[k] || ""])
          )
        : current
      const missing = badRefs(Object.values(nextEnv), conn.projectId ?? "")
      if (missing.length) return c.json({ error: refError(missing) }, 400)
      const [row] = await db
        .update(connection)
        .set({
          ...rest,
          url: commandLine(command, args),
          secretEnc: encrypt(nextEnv),
        })
        .where(eq(connection.id, conn.id))
        .returning()
      await connect(row)
      return c.json(publicConnection((await getConnection(row.id)) ?? row))
    }
    // Remote MCP: the name and the fixed headers change; the URL stays.
    if (conn.kind === "mcp") {
      const input = z
        .object({
          name: z.string().trim().min(1).optional(),
          headers: remoteHeaders.optional(),
        })
        .safeParse(await c.req.json())
      if (!input.success)
        return c.json({ error: z.prettifyError(input.error) }, 400)
      const { headers, ...rest } = input.data
      if (!headers) {
        const [row] = await db
          .update(connection)
          .set(rest)
          .where(eq(connection.id, conn.id))
          .returning()
        return c.json(publicConnection(row))
      }
      // An empty value keeps the current one; a missing header is removed.
      const current = decrypt<Record<string, string>>(conn.secretEnc) ?? {}
      const next = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k, v || current[k] || ""])
      )
      const empty = Object.keys(next).filter((k) => !next[k])
      if (empty.length)
        return c.json(
          { error: `header without a value: ${empty.join(", ")}` },
          400
        )
      const missing = badRefs(Object.values(next), conn.projectId ?? "")
      if (missing.length) return c.json({ error: refError(missing) }, 400)
      const [row] = await db
        .update(connection)
        .set({
          ...rest,
          secretEnc: Object.keys(next).length ? encrypt(next) : null,
        })
        .where(eq(connection.id, conn.id))
        .returning()
      await connect(row)
      return c.json(publicConnection((await getConnection(row.id)) ?? row))
    }
    const input = apiFields
      .partial()
      .extend({ name: z.string().min(1).optional(), url: httpUrl.optional() })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { secret: key, ...rest } = input.data
    const missing = key ? badRefs([key], conn.projectId ?? "") : []
    if (missing.length) return c.json({ error: refError(missing) }, 400)
    const [row] = await db
      .update(connection)
      .set({ ...rest, ...(key ? { secretEnc: encrypt(key) } : {}) })
      .where(eq(connection.id, conn.id))
      .returning()
    await connectApi(row)
    return c.json(publicConnection((await getConnection(row.id)) ?? row))
  })
  // Moves the connection to another project. It leaves project scopes other than the new one;
  // organization scopes keep it.
  .put("/connections/:id/project", async (c) => {
    const conn = await getConnection(c.req.param("id"))
    if (!conn) return c.json({ error: "connection not found" }, 404)
    const input = z
      .object({ projectId: z.string().min(1) })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { projectId } = input.data
    const missing = badRefs(storedRefs(conn), projectId)
    if (missing.length)
      return c.json(
        {
          error: `${refError(missing)} in the target project; use {{secret:<project>/<NAME>}} or create it there`,
        },
        400
      )
    const [dup] = await db
      .select({ id: connection.id })
      .from(connection)
      .where(
        and(
          eq(connection.projectId, projectId),
          eq(connection.slug, conn.slug),
          ne(connection.id, conn.id)
        )
      )
    if (dup)
      return c.json(
        { error: `the target project already has a connection ${conn.slug}` },
        409
      )
    const [from] = await db
      .select({ orgId: project.orgId })
      .from(project)
      .where(eq(project.id, conn.projectId ?? ""))
    const [to] = await db
      .select({ orgId: project.orgId })
      .from(project)
      .where(eq(project.id, projectId))
    if (!to) return c.json({ error: "project not found" }, 404)
    const leaving = await db
      .select({ id: scope.id })
      .from(scope)
      .innerJoin(scopeConnection, eq(scopeConnection.scopeId, scope.id))
      .where(eq(scopeConnection.connectionId, conn.id))
    const stays = new Set(
      (
        await db
          .select({ id: scope.id })
          .from(scope)
          .where(
            from?.orgId === to.orgId
              ? isNull(scope.projectId)
              : eq(scope.projectId, projectId)
          )
      ).map((s) => s.id)
    )
    db.transaction((tx) => {
      for (const { id } of leaving) {
        if (!stays.has(id))
          tx.delete(scopeConnection)
            .where(
              and(
                eq(scopeConnection.scopeId, id),
                eq(scopeConnection.connectionId, conn.id)
              )
            )
            .run()
      }
      tx.update(connection)
        .set({ projectId })
        .where(eq(connection.id, conn.id))
        .run()
    })
    return c.body(null, 204)
  })
  .post("/connections/:id/connect", async (c) => {
    const conn = await getConnection(c.req.param("id"))
    if (!conn) return c.json({ error: "connection not found" }, 404)
    // Reconnecting a stdio connection restarts the process.
    if (conn.kind === "stdio") stopStdio(conn.id)
    return c.json(await connect(conn))
  })
  .get("/connections/:id/tools", async (c) => {
    const conn = await getConnection(c.req.param("id"))
    if (!conn) return c.json({ error: "connection not found" }, 404)
    const { tools } =
      conn.kind === "api"
        ? { tools: operations(conn) }
        : await withUpstream(conn, (client) => client.listTools())
    return c.json(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }))
    )
  })
  .delete("/connections/:id", async (c) => {
    stopStdio(c.req.param("id"))
    await db.delete(connection).where(eq(connection.id, c.req.param("id")))
    return c.body(null, 204)
  })

  // Scopes
  .get("/scopes", async (c) => {
    const scopes = await db.select().from(scope).orderBy(scope.name)
    const links = await db.select().from(scopeConnection)
    const secretLinks = await db.select().from(scopeSecret)
    return c.json(
      scopes.map((s) => ({
        ...s,
        secretIds: secretLinks
          .filter((l) => l.scopeId === s.id)
          .map((l) => l.secretId),
        connectionIds: links
          .filter((l) => l.scopeId === s.id)
          .map((l) => l.connectionId),
        allowedTools: Object.fromEntries(
          links
            .filter((l) => l.scopeId === s.id)
            .map((l) => [l.connectionId, l.allowedTools ?? null])
        ),
      }))
    )
  })
  .post("/scopes", async (c) => {
    const input = scopeInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { connectionIds, secretIds, allowedTools, ...data } = input.data
    const bad = await outOfReach(data.orgId, data.projectId, connectionIds)
    if (bad.length)
      return c.json({ error: "connections outside the scope's project" }, 400)
    if ((await secretsOutOfReach(data.orgId, data.projectId, secretIds)).length)
      return c.json({ error: "secrets outside the scope's project" }, 400)
    const [dup] = await db
      .select({ id: scope.id })
      .from(scope)
      .where(and(eq(scope.orgId, data.orgId), eq(scope.slug, data.slug)))
    if (dup)
      return c.json(
        { error: `a scope with identifier ${data.slug} already exists` },
        409
      )
    const id = randomUUID()
    db.transaction((tx) => {
      tx.insert(scope)
        .values({ id, ...data })
        .run()
      for (const connectionId of connectionIds) {
        tx.insert(scopeConnection)
          .values({
            scopeId: id,
            connectionId,
            allowedTools: allowedTools[connectionId] ?? null,
          })
          .run()
      }
      for (const secretId of secretIds)
        tx.insert(scopeSecret).values({ scopeId: id, secretId }).run()
    })
    return c.json({ id }, 201)
  })
  .put("/scopes/:id/connections", async (c) => {
    const input = z
      .object({
        connectionIds: scopeInput.shape.connectionIds,
        secretIds: scopeInput.shape.secretIds,
        allowedTools: scopeInput.shape.allowedTools,
      })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const scopeId = c.req.param("id")
    const [s] = await db.select().from(scope).where(eq(scope.id, scopeId))
    if (!s) return c.json({ error: "scope not found" }, 404)
    const bad = await outOfReach(
      s.orgId ?? "",
      s.projectId,
      input.data.connectionIds
    )
    if (bad.length)
      return c.json({ error: "connections outside the scope's project" }, 400)
    const badSecrets = await secretsOutOfReach(
      s.orgId ?? "",
      s.projectId,
      input.data.secretIds
    )
    if (badSecrets.length)
      return c.json({ error: "secrets outside the scope's project" }, 400)
    db.transaction((tx) => {
      tx.delete(scopeConnection)
        .where(eq(scopeConnection.scopeId, scopeId))
        .run()
      tx.delete(scopeSecret).where(eq(scopeSecret.scopeId, scopeId)).run()
      for (const secretId of input.data.secretIds)
        tx.insert(scopeSecret).values({ scopeId, secretId }).run()
      const { connectionIds, allowedTools } = input.data
      for (const connectionId of connectionIds) {
        tx.insert(scopeConnection)
          .values({
            scopeId,
            connectionId,
            allowedTools: allowedTools[connectionId] ?? null,
          })
          .run()
      }
    })
    return c.body(null, 204)
  })
  .patch("/scopes/:id", async (c) => {
    const input = rename.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const [row] = await db
      .update(scope)
      .set(input.data)
      .where(eq(scope.id, c.req.param("id")))
      .returning()
    if (!row) return c.json({ error: "scope not found" }, 404)
    return c.body(null, 204)
  })
  .delete("/scopes/:id", async (c) => {
    await db.delete(scope).where(eq(scope.id, c.req.param("id")))
    return c.body(null, 204)
  })

  // Consumer tokens (api-key plugin). permissions holds the target: { org | project | scope: [id] }.
  // Tokens older than projects have { scope: [slug] }.
  .get("/tokens", async (c) => {
    const result = await auth.api.listApiKeys({ headers: c.req.raw.headers })
    const keys = Array.isArray(result) ? result : result.apiKeys
    const scopes = await db.select().from(scope)
    return c.json(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        start: k.start,
        target: (() => {
          const p = (k.permissions ?? {}) as Record<string, string[]>
          if (p.org?.[0]) return { kind: "org", id: p.org[0] }
          if (p.project?.[0]) return { kind: "project", id: p.project[0] }
          const ref = p.scope?.[0]
          const s = scopes.find((x) => x.id === ref || x.slug === ref)
          return { kind: "scope", id: s?.id ?? ref ?? "" }
        })(),
        mode: toolMode(k.metadata),
        expiresAt: k.expiresAt,
        lastRequest: k.lastRequest,
        createdAt: k.createdAt,
      }))
    )
  })
  .post("/tokens", async (c) => {
    const input = tokenInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { kind, id } = input.data.target
    const table = { org: organization, project, scope }[kind]
    const [exists] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, id))
    if (!exists) return c.json({ error: "token target not found" }, 404)
    const created = await auth.api.createApiKey({
      body: {
        name: input.data.name,
        userId: c.get("session").user.id,
        permissions: { [kind]: [id] },
        metadata: { mode: input.data.mode },
        expiresIn: input.data.expiresInDays
          ? input.data.expiresInDays * 86_400
          : null,
      },
    })
    // The plain key exists only in this response.
    return c.json({ id: created.id, key: created.key }, 201)
  })
  // The tool mode can change at any time; clients see it on their next tools/list.
  .patch("/tokens/:id", async (c) => {
    const input = z
      .object({ mode: z.enum(["tools", "code"]) })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    await auth.api.updateApiKey({
      body: {
        keyId: c.req.param("id"),
        userId: c.get("session").user.id,
        metadata: { mode: input.data.mode },
      },
    })
    return c.body(null, 204)
  })
  .delete("/tokens/:id", async (c) => {
    await auth.api.deleteApiKey({
      headers: c.req.raw.headers,
      body: { keyId: c.req.param("id") },
    })
    return c.body(null, 204)
  })
