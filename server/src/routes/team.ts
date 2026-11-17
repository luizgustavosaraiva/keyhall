import { createHash, randomBytes, randomUUID } from "node:crypto"
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import { findTarget, toolMode } from "../access.js"
import { auth, googleLogin } from "../auth.js"
import { db } from "../db/index.js"
import {
  apikey,
  connection,
  member,
  memberConnection,
  memberScope,
  memberSecret,
  organization,
  project,
  scope,
  secret,
  user,
} from "../db/schema.js"
import { type AdminEnv, requireAdmin, requireUser } from "./middleware.js"

// Team: the admin invites people to an organization by link and grants each one connections
// (optionally only some tools), scopes and secrets. Members sign in to the same panel, see only
// what was granted, and make their own tokens within it. Grants are read on every call.

const INVITE_DAYS = 7
const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex")

const panelUrl = () =>
  (process.env.BETTER_AUTH_URL ?? "http://localhost:8787").replace(/\/+$/, "")

// A new link replaces the previous one; only its hash is stored.
function newInvite() {
  const code = randomBytes(24).toString("base64url")
  return {
    code,
    link: `${panelUrl()}/#invite=${code}`,
    inviteHash: hashCode(code),
    inviteExpires: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  }
}

type Member = typeof member.$inferSelect

const status = (m: Member) =>
  m.userId
    ? "active"
    : m.inviteExpires && m.inviteExpires.getTime() > Date.now()
      ? "invited"
      : "expired"

async function grantsOf(memberIds: string[]) {
  if (!memberIds.length) return { conns: [], scopes: [], secrets: [] }
  const [conns, scopes, secrets] = await Promise.all([
    db
      .select()
      .from(memberConnection)
      .where(inArray(memberConnection.memberId, memberIds)),
    db
      .select()
      .from(memberScope)
      .where(inArray(memberScope.memberId, memberIds)),
    db
      .select()
      .from(memberSecret)
      .where(inArray(memberSecret.memberId, memberIds)),
  ])
  return { conns, scopes, secrets }
}

const grantsInput = z.object({
  // Per connection: allowed tools; null = all, including future ones.
  connections: z.record(z.string(), z.array(z.string()).nullable()).default({}),
  scopeIds: z.array(z.string()).default([]),
  secretIds: z.array(z.string()).default([]),
})

// Ids outside the member's organization are refused, so a grant never crosses organizations.
async function foreignIds(orgId: string, g: z.infer<typeof grantsInput>) {
  const connIds = Object.keys(g.connections)
  const [conns, scopes, secrets] = await Promise.all([
    connIds.length
      ? db
          .select({ id: connection.id })
          .from(connection)
          .innerJoin(project, eq(connection.projectId, project.id))
          .where(and(inArray(connection.id, connIds), eq(project.orgId, orgId)))
      : [],
    g.scopeIds.length
      ? db
          .select({ id: scope.id })
          .from(scope)
          .where(and(inArray(scope.id, g.scopeIds), eq(scope.orgId, orgId)))
      : [],
    g.secretIds.length
      ? db
          .select({ id: secret.id })
          .from(secret)
          .innerJoin(project, eq(secret.projectId, project.id))
          .where(and(inArray(secret.id, g.secretIds), eq(project.orgId, orgId)))
      : [],
  ])
  const known = new Set([...conns, ...scopes, ...secrets].map((r) => r.id))
  return [...connIds, ...g.scopeIds, ...g.secretIds].filter(
    (id) => !known.has(id)
  )
}

// Removing someone's last membership removes the account too: their sessions and tokens end.
async function dropOrphanUser(userId: string | null) {
  if (!userId) return
  const [u] = await db.select().from(user).where(eq(user.id, userId))
  if (!u || u.role === "admin") return
  const [still] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
  if (still) return
  await db.delete(apikey).where(eq(apikey.referenceId, userId))
  await db.delete(user).where(eq(user.id, userId))
}

export const adminTeam = new Hono<AdminEnv>()
  .use(requireAdmin)
  .get("/", async (c) => {
    const rows = await db
      .select({ member, name: user.name })
      .from(member)
      .leftJoin(user, eq(member.userId, user.id))
      .orderBy(member.email)
    const g = await grantsOf(rows.map((r) => r.member.id))
    return c.json(
      rows.map(({ member: m, name }) => ({
        id: m.id,
        orgId: m.orgId,
        email: m.email,
        name,
        status: status(m),
        inviteExpires: m.userId ? null : m.inviteExpires,
        joinedAt: m.joinedAt,
        createdAt: m.createdAt,
        connections: Object.fromEntries(
          g.conns
            .filter((x) => x.memberId === m.id)
            .map((x) => [x.connectionId, x.allowedTools ?? null])
        ),
        scopeIds: g.scopes
          .filter((x) => x.memberId === m.id)
          .map((x) => x.scopeId),
        secretIds: g.secrets
          .filter((x) => x.memberId === m.id)
          .map((x) => x.secretId),
      }))
    )
  })
  .post("/", async (c) => {
    const input = z
      .object({ orgId: z.string().min(1), email: z.email() })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const email = input.data.email.trim().toLowerCase()
    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, input.data.orgId))
    if (!org) return c.json({ error: "organization not found" }, 404)
    const [existing] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.email, email))
    if (existing?.role === "admin")
      return c.json({ error: "admins already reach everything" }, 409)
    const [dup] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.orgId, org.id), eq(member.email, email)))
    if (dup)
      return c.json({ error: "already invited to this organization" }, 409)
    const { code: _, link, ...invite } = newInvite()
    const id = randomUUID()
    await db.insert(member).values({
      id,
      orgId: org.id,
      email,
      invitedBy: c.get("session").user.email,
      ...invite,
    })
    // The plain link exists only in this response.
    return c.json({ id, link }, 201)
  })
  .post("/:id/link", async (c) => {
    const [m] = await db
      .select()
      .from(member)
      .where(eq(member.id, c.req.param("id")))
    if (!m) return c.json({ error: "member not found" }, 404)
    if (m.userId) return c.json({ error: "already joined" }, 409)
    const { code: _, link, ...invite } = newInvite()
    await db.update(member).set(invite).where(eq(member.id, m.id))
    return c.json({ link })
  })
  .put("/:id/grants", async (c) => {
    const input = grantsInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const [m] = await db
      .select()
      .from(member)
      .where(eq(member.id, c.req.param("id")))
    if (!m) return c.json({ error: "member not found" }, 404)
    const foreign = await foreignIds(m.orgId, input.data)
    if (foreign.length)
      return c.json(
        { error: `not in this organization: ${foreign.join(", ")}` },
        400
      )
    const { connections, scopeIds, secretIds } = input.data
    db.transaction((tx) => {
      tx.delete(memberConnection)
        .where(eq(memberConnection.memberId, m.id))
        .run()
      tx.delete(memberScope).where(eq(memberScope.memberId, m.id)).run()
      tx.delete(memberSecret).where(eq(memberSecret.memberId, m.id)).run()
      const conns = Object.entries(connections)
      if (conns.length)
        tx.insert(memberConnection)
          .values(
            conns.map(([connectionId, allowedTools]) => ({
              memberId: m.id,
              connectionId,
              allowedTools,
            }))
          )
          .run()
      if (scopeIds.length)
        tx.insert(memberScope)
          .values(scopeIds.map((scopeId) => ({ memberId: m.id, scopeId })))
          .run()
      if (secretIds.length)
        tx.insert(memberSecret)
          .values(secretIds.map((secretId) => ({ memberId: m.id, secretId })))
          .run()
    })
    return c.body(null, 204)
  })
  .delete("/:id", async (c) => {
    const [m] = await db
      .select()
      .from(member)
      .where(eq(member.id, c.req.param("id")))
    if (!m) return c.json({ error: "member not found" }, 404)
    await db.delete(member).where(eq(member.id, m.id))
    await dropOrphanUser(m.userId)
    return c.body(null, 204)
  })

async function openInvite(code: string) {
  const [row] = await db
    .select({ member, org: organization })
    .from(member)
    .innerJoin(organization, eq(member.orgId, organization.id))
    .where(eq(member.inviteHash, hashCode(code)))
  if (!row || row.member.userId || status(row.member) !== "invited") return
  return row
}

const acceptInput = z.union([
  z.object({
    name: z.string().trim().min(1),
    password: z.string().min(8, "the password needs at least 8 characters"),
  }),
  // Google: the account is made without a password and the invitee signs in with Google next.
  z.object({ google: z.literal(true), name: z.string().trim().min(1) }),
  // Someone who already has an account (a member of another organization), signed in.
  z.object({}),
])

// Public: the invite link opens this. The code is the only credential.
export const invite = new Hono()
  .get("/:code", async (c) => {
    const row = await openInvite(c.req.param("code"))
    if (!row) return c.json({ error: "invalid or expired invitation" }, 404)
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, row.member.email))
    return c.json({
      email: row.member.email,
      org: row.org.name,
      existing: !!existing,
      google: googleLogin,
    })
  })
  .post("/:code/accept", async (c) => {
    const row = await openInvite(c.req.param("code"))
    if (!row) return c.json({ error: "invalid or expired invitation" }, 404)
    const input = acceptInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { email } = row.member
    const [existing] = await db.select().from(user).where(eq(user.email, email))
    let userId: string
    if (existing) {
      // Joining with an account that exists needs that account's session.
      const session = await auth.api.getSession({ headers: c.req.raw.headers })
      if (session?.user.id !== existing.id)
        return c.json({ error: `sign in as ${email} to accept` }, 403)
      userId = existing.id
    } else if ("password" in input.data) {
      const created = await auth.api.createUser({
        body: {
          email,
          password: input.data.password,
          name: input.data.name,
          role: "user",
        },
      })
      userId = created.user.id
    } else if ("google" in input.data) {
      if (!googleLogin)
        return c.json({ error: "Google sign-in is not enabled" }, 400)
      const created = await auth.api.createUser({
        body: { email, name: input.data.name, role: "user" },
      })
      userId = created.user.id
      // Google links to a local account only when both e-mails are verified; the invitation
      // vouches for this one, and Google's own check still has to pass.
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, userId))
    } else return c.json({ error: "choose a password or Google" }, 400)
    await db
      .update(member)
      .set({
        userId,
        joinedAt: new Date(),
        inviteHash: null,
        inviteExpires: null,
      })
      .where(eq(member.id, row.member.id))
    return c.json({ email })
  })

const tokenInput = z.object({
  name: z.string().min(1),
  target: z.object({
    kind: z.enum(["member", "scope"]),
    id: z.string().min(1),
  }),
  expiresInDays: z.number().int().positive().optional(),
  mode: z.enum(["tools", "code"]).default("code"),
})

// The member's side: what was granted to them, and their own tokens within it.
export const me = new Hono<AdminEnv>()
  .use(requireUser)
  .get("/reach", async (c) => {
    const userId = c.get("session").user.id
    const rows = await db
      .select({ member, org: organization })
      .from(member)
      .innerJoin(organization, eq(member.orgId, organization.id))
      .where(and(eq(member.userId, userId), isNotNull(member.joinedAt)))
      .orderBy(organization.name)
    const ids = rows.map((r) => r.member.id)
    if (!ids.length) return c.json([])
    const [conns, scopes, secrets] = await Promise.all([
      db
        .select({
          memberId: memberConnection.memberId,
          allowedTools: memberConnection.allowedTools,
          conn: connection,
          project,
        })
        .from(memberConnection)
        .innerJoin(connection, eq(memberConnection.connectionId, connection.id))
        .innerJoin(project, eq(connection.projectId, project.id))
        .where(inArray(memberConnection.memberId, ids)),
      db
        .select({ memberId: memberScope.memberId, scope })
        .from(memberScope)
        .innerJoin(scope, eq(memberScope.scopeId, scope.id))
        .where(inArray(memberScope.memberId, ids)),
      db
        .select({ memberId: memberSecret.memberId, secret, project })
        .from(memberSecret)
        .innerJoin(secret, eq(memberSecret.secretId, secret.id))
        .innerJoin(project, eq(secret.projectId, project.id))
        .where(inArray(memberSecret.memberId, ids)),
    ])
    // Names and status only: members never see addresses, headers or credentials.
    return c.json(
      rows.map(({ member: m, org }) => ({
        memberId: m.id,
        org: { id: org.id, name: org.name, slug: org.slug },
        connections: conns
          .filter((x) => x.memberId === m.id)
          .map(({ conn, project: p, allowedTools }) => ({
            id: conn.id,
            name: conn.name,
            slug: conn.slug,
            kind: conn.kind,
            plugin: conn.plugin,
            status: conn.status,
            project: { name: p.name, slug: p.slug },
            allowedTools: allowedTools ?? null,
          })),
        scopes: scopes
          .filter((x) => x.memberId === m.id)
          .map(({ scope: s }) => ({ id: s.id, name: s.name, slug: s.slug })),
        secrets: secrets
          .filter((x) => x.memberId === m.id)
          .map(({ secret: s, project: p }) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            agentAccess: s.agentAccess,
            project: { name: p.name, slug: p.slug },
          })),
      }))
    )
  })
  .get("/tokens", async (c) => {
    const result = await auth.api.listApiKeys({ headers: c.req.raw.headers })
    const keys = Array.isArray(result) ? result : result.apiKeys
    return c.json(
      keys.map((k) => {
        const p = (k.permissions ?? {}) as Record<string, string[]>
        return {
          id: k.id,
          name: k.name,
          start: k.start,
          target: p.member?.[0]
            ? { kind: "member", id: p.member[0] }
            : { kind: "scope", id: p.scope?.[0] ?? "" },
          mode: toolMode(k.metadata),
          expiresAt: k.expiresAt,
          lastRequest: k.lastRequest,
          createdAt: k.createdAt,
        }
      })
    )
  })
  .post("/tokens", async (c) => {
    const input = tokenInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const userId = c.get("session").user.id
    const { kind, id } = input.data.target
    if (!(await findTarget(userId, { [kind]: [id] })))
      return c.json({ error: "token target not found" }, 404)
    const created = await auth.api.createApiKey({
      body: {
        name: input.data.name,
        userId,
        permissions: { [kind]: [id] },
        metadata: { mode: input.data.mode },
        expiresIn: input.data.expiresInDays
          ? input.data.expiresInDays * 86_400
          : null,
      },
    })
    return c.json({ id: created.id, key: created.key }, 201)
  })
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
