import { createHash, randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { and, desc, eq, gt, inArray } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import type { Access, Link } from "./access.js"
import { db } from "./db/index.js"
import { connection, project, toolApproval, user } from "./db/schema.js"
import { notifyApproval } from "./notifications.js"
import { type AdminEnv, requireAdmin } from "./routes/middleware.js"
import { APPROVAL_LIMITS, approvalTiming, writeSetting } from "./settings.js"

// Tools that need an admin's approval on every call. The agent's call waits a little for the
// decision (in the panel), so an admin watching approves it in place. Past that, the agent is
// told to repeat the same call later: the approval then holds for that exact call (same token,
// tool and arguments) until it expires, once. Unattended runs never hang; they get a clear
// "waiting for approval".

const decided = new EventEmitter()
decided.setMaxListeners(0)

export const needsApproval = (link: Link, tool: string) =>
  !!link.conn.approvalTools?.includes(tool)

// Arguments as canonical JSON (sorted keys), so the same call gets the same key.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    )
  return value
}

const callKeyOf = (
  tokenId: string,
  connectionId: string,
  tool: string,
  args: unknown
) =>
  createHash("sha256")
    .update(
      JSON.stringify([tokenId, connectionId, tool, canonical(args ?? {})])
    )
    .digest("hex")

export type Outcome =
  | { status: "approved" }
  | { status: "denied"; by: string | null }
  | { status: "pending"; id: string }

// Marks an approval used; only one caller wins it.
function claim(id: string) {
  const res = db
    .update(toolApproval)
    .set({ status: "used" })
    .where(and(eq(toolApproval.id, id), eq(toolApproval.status, "approved")))
    .run()
  return res.changes === 1
}

export async function requestApproval(
  access: Access,
  link: Link,
  tool: string,
  exposedName: string,
  args: unknown
): Promise<Outcome> {
  const callKey = callKeyOf(access.token.id, link.conn.id, tool, args)
  const timing = approvalTiming()
  const now = new Date()
  const open = await db
    .select()
    .from(toolApproval)
    .where(
      and(
        eq(toolApproval.callKey, callKey),
        inArray(toolApproval.status, ["pending", "approved"]),
        gt(toolApproval.expiresAt, now)
      )
    )
    .orderBy(desc(toolApproval.createdAt))
  const approved = open.find((a) => a.status === "approved")
  if (approved && claim(approved.id)) return { status: "approved" }
  let pending = open.find((a) => a.status === "pending")
  if (!pending) {
    const [owner] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, access.token.userId))
    ;[pending] = await db
      .insert(toolApproval)
      .values({
        id: randomUUID(),
        connectionId: link.conn.id,
        tool,
        exposedName,
        args: args ?? {},
        callKey,
        tokenId: access.token.id,
        tokenName: access.token.name,
        requestedBy: owner?.email ?? access.token.userId,
        expiresAt: new Date(now.getTime() + timing.validMinutes * 60_000),
      })
      .returning()
    notifyApproval({
      id: pending.id,
      tool,
      exposedName,
      connection: link.conn.name,
      tokenName: pending.tokenName,
      requestedBy: pending.requestedBy,
      args: pending.args,
      expiresAt: pending.expiresAt,
    })
  }
  const id = pending.id
  const decision = await new Promise<"approved" | "denied" | "timeout">(
    (resolve) => {
      const done = (d: "approved" | "denied" | "timeout") => {
        clearTimeout(timer)
        decided.off(id, done)
        resolve(d)
      }
      const timer = setTimeout(() => done("timeout"), timing.waitSeconds * 1000)
      decided.on(id, done)
    }
  )
  if (decision === "timeout") return { status: "pending", id }
  if (decision === "denied") {
    const [row] = await db
      .select({ by: toolApproval.decidedBy })
      .from(toolApproval)
      .where(eq(toolApproval.id, id))
    return { status: "denied", by: row?.by ?? null }
  }
  return claim(id) ? { status: "approved" } : { status: "pending", id }
}

const statusOf = (a: typeof toolApproval.$inferSelect) =>
  (a.status === "pending" || a.status === "approved") &&
  a.expiresAt.getTime() <= Date.now()
    ? "expired"
    : a.status

export const approvals = new Hono<AdminEnv>()
  .use(requireAdmin)
  // Pending first, then the latest decisions.
  .get("/", async (c) => {
    const rows = await db
      .select({
        a: toolApproval,
        connection: { id: connection.id, name: connection.name },
        project: { id: project.id, orgId: project.orgId, name: project.name },
      })
      .from(toolApproval)
      .innerJoin(connection, eq(toolApproval.connectionId, connection.id))
      .innerJoin(project, eq(connection.projectId, project.id))
      .orderBy(desc(toolApproval.createdAt))
      .limit(100)
    return c.json(
      rows.map(({ a, connection: conn, project: p }) => ({
        id: a.id,
        tool: a.tool,
        exposedName: a.exposedName,
        args: a.args,
        tokenName: a.tokenName,
        requestedBy: a.requestedBy,
        status: statusOf(a),
        decidedBy: a.decidedBy,
        decidedAt: a.decidedAt,
        expiresAt: a.expiresAt,
        createdAt: a.createdAt,
        connection: conn,
        project: p,
      }))
    )
  })
  .post("/:id/:decision{approve|deny}", async (c) => {
    const id = c.req.param("id")
    const approve = c.req.param("decision") === "approve"
    const res = db
      .update(toolApproval)
      .set({
        status: approve ? "approved" : "denied",
        decidedBy: c.get("session").user.email,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(toolApproval.id, id),
          eq(toolApproval.status, "pending"),
          gt(toolApproval.expiresAt, new Date())
        )
      )
      .run()
    if (res.changes !== 1) return c.json({ error: "no longer pending" }, 409)
    decided.emit(id, approve ? "approved" : "denied")
    return c.body(null, 204)
  })
  // How long calls wait and approvals hold; the environment gives only the starting values.
  .get("/settings", (c) =>
    c.json({ ...approvalTiming(), limits: APPROVAL_LIMITS })
  )
  .put("/settings", async (c) => {
    const { waitSeconds: w, validMinutes: v } = APPROVAL_LIMITS
    const input = z
      .object({
        waitSeconds: z.number().int().min(w.min).max(w.max),
        validMinutes: z.number().int().min(v.min).max(v.max),
      })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    writeSetting("approvals", input.data)
    return c.json(approvalTiming())
  })
  // Which tools of a connection need approval.
  .put("/rules/:connectionId", async (c) => {
    const input = z
      .object({ tools: z.array(z.string().min(1)) })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const tools = [...new Set(input.data.tools)]
    const res = db
      .update(connection)
      .set({ approvalTools: tools.length ? tools : null })
      .where(eq(connection.id, c.req.param("connectionId")))
      .run()
    if (res.changes !== 1) return c.json({ error: "connection not found" }, 404)
    return c.body(null, 204)
  })
