import { eq, inArray, or, type SQL } from "drizzle-orm"
import { auth } from "./auth.js"
import { db } from "./db/index.js"
import {
  connection,
  organization,
  project,
  scope,
  scopeConnection,
} from "./db/schema.js"

// What a token sees. The api-key permissions hold the target:
// { org: [id] } | { project: [id] } | { scope: [id] }. Older tokens have { scope: [slug] }.
export type Target =
  | { kind: "org"; org: typeof organization.$inferSelect }
  | { kind: "project"; project: typeof project.$inferSelect }
  | { kind: "scope"; scope: typeof scope.$inferSelect }

export type Link = {
  conn: typeof connection.$inferSelect
  project: typeof project.$inferSelect
  // null = every tool of the connection, including future ones.
  allowedTools: string[] | null
  // Prepended to each tool name: <connection>__ or <project>__<connection>__.
  prefix: string
}

export type Access = {
  target: Target
  links: Link[]
  // The caller, for the vault's read log.
  token: { id: string; name: string }
}

const SEP = "__"

async function connectionsOf(where: SQL) {
  return db
    .select({ conn: connection, project })
    .from(connection)
    .innerJoin(project, eq(connection.projectId, project.id))
    .where(where)
}

async function findTarget(
  permissions: Record<string, string[]> | null
): Promise<Target | undefined> {
  const [orgId] = permissions?.org ?? []
  if (orgId) {
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
    return org && { kind: "org", org }
  }
  const [projectId] = permissions?.project ?? []
  if (projectId) {
    const [p] = await db.select().from(project).where(eq(project.id, projectId))
    return p && { kind: "project", project: p }
  }
  const [scopeRef] = permissions?.scope ?? []
  if (scopeRef) {
    const [s] = await db
      .select()
      .from(scope)
      .where(or(eq(scope.id, scopeRef), eq(scope.slug, scopeRef)))
    return s && { kind: "scope", scope: s }
  }
}

export async function linksFor(target: Target): Promise<Link[]> {
  if (target.kind === "org") {
    const projects = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.orgId, target.org.id))
    if (!projects.length) return []
    const rows = await connectionsOf(
      inArray(
        connection.projectId,
        projects.map((p) => p.id)
      )
    )
    return rows.map(({ conn, project: p }) => ({
      conn,
      project: p,
      allowedTools: null,
      prefix: `${p.slug}${SEP}${conn.slug}${SEP}`,
    }))
  }
  if (target.kind === "project") {
    const rows = await connectionsOf(
      eq(connection.projectId, target.project.id)
    )
    return rows.map(({ conn, project: p }) => ({
      conn,
      project: p,
      allowedTools: null,
      prefix: `${conn.slug}${SEP}`,
    }))
  }
  const rows = await db
    .select({
      conn: connection,
      project,
      allowedTools: scopeConnection.allowedTools,
    })
    .from(scopeConnection)
    .innerJoin(connection, eq(scopeConnection.connectionId, connection.id))
    .innerJoin(project, eq(connection.projectId, project.id))
    .where(eq(scopeConnection.scopeId, target.scope.id))
  // Project scope: plain names. An organization scope spans projects, so the project joins the name.
  const multi = target.scope.projectId === null
  return rows.map(({ conn, project: p, allowedTools }) => ({
    conn,
    project: p,
    allowedTools: allowedTools ?? null,
    prefix: multi ? `${p.slug}${SEP}${conn.slug}${SEP}` : `${conn.slug}${SEP}`,
  }))
}

// Verifies the token (Authorization: Bearer kh_...) and returns its target and reachable connections.
export async function resolveToken(key: string): Promise<Access | undefined> {
  const { valid, key: apiKey } = await auth.api.verifyApiKey({ body: { key } })
  if (!valid || !apiKey) return undefined
  const target = await findTarget(
    apiKey.permissions as Record<string, string[]> | null
  )
  if (!target) return undefined
  return {
    target,
    links: await linksFor(target),
    token: { id: apiKey.id, name: apiKey.name ?? apiKey.id },
  }
}
