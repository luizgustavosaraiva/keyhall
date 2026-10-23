import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import { seal } from "../crypto.js"
import { db } from "../db/index.js"
import { secret, secretAccess, secretVersion } from "../db/schema.js"
import { currentValue, logAccess, SECRET_NAME } from "../secrets/store.js"
import { connectionsUsing } from "./admin.js"
import { type AdminEnv, requireAdmin } from "./middleware.js"

const name = z
  .string()
  .regex(
    SECRET_NAME,
    "use letters, numbers and underscores (like an environment variable)"
  )
const value = z
  .string()
  .min(1)
  .max(64 * 1024)

const createInput = z.object({
  projectId: z.string().min(1),
  name,
  value,
  description: z.string().trim().max(500).optional(),
  agentAccess: z.boolean().default(false),
})

const updateInput = z.object({
  value: value.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  agentAccess: z.boolean().optional(),
})

type Secret = typeof secret.$inferSelect

const publicSecret = async (s: Secret) => ({
  id: s.id,
  projectId: s.projectId,
  name: s.name,
  description: s.description,
  agentAccess: s.agentAccess,
  version: s.version,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
  usedBy: (await connectionsUsing(s)).map((c) => c.id),
})

async function getSecret(id: string) {
  const [s] = await db.select().from(secret).where(eq(secret.id, id))
  return s
}

// Vault for the panel. Values only leave through /reveal, and every reveal is logged.
export const adminSecrets = new Hono<AdminEnv>()
  .use(requireAdmin)
  .get("/", async (c) => {
    const rows = await db.select().from(secret).orderBy(secret.name)
    return c.json(await Promise.all(rows.map(publicSecret)))
  })
  .post("/", async (c) => {
    const input = createInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { value: plain, ...data } = input.data
    const [dup] = await db
      .select({ id: secret.id })
      .from(secret)
      .where(
        and(eq(secret.projectId, data.projectId), eq(secret.name, data.name))
      )
    if (dup)
      return c.json(
        { error: `a secret named ${data.name} already exists in this project` },
        409
      )
    const id = randomUUID()
    const author = c.get("session").user.email
    db.transaction((tx) => {
      tx.insert(secret)
        .values({ id, ...data, version: 1 })
        .run()
      tx.insert(secretVersion)
        .values({ secretId: id, version: 1, createdBy: author, ...seal(plain) })
        .run()
    })
    const created = await getSecret(id)
    return c.json(created && (await publicSecret(created)), 201)
  })
  // A new value is a new version; description and agent access change without one.
  .patch("/:id", async (c) => {
    const s = await getSecret(c.req.param("id"))
    if (!s) return c.json({ error: "secret not found" }, 404)
    const input = updateInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { value: plain, ...data } = input.data
    const version = plain ? s.version + 1 : s.version
    const author = c.get("session").user.email
    db.transaction((tx) => {
      if (plain)
        tx.insert(secretVersion)
          .values({
            secretId: s.id,
            version,
            createdBy: author,
            ...seal(plain),
          })
          .run()
      tx.update(secret)
        .set({ ...data, version })
        .where(eq(secret.id, s.id))
        .run()
    })
    const updated = await getSecret(s.id)
    return c.json(updated && (await publicSecret(updated)))
  })
  .post("/:id/reveal", async (c) => {
    const s = await getSecret(c.req.param("id"))
    if (!s) return c.json({ error: "secret not found" }, 404)
    await logAccess(s, "panel", c.get("session").user.email)
    return c.json({ version: s.version, value: currentValue(s) })
  })
  .get("/:id/history", async (c) => {
    const s = await getSecret(c.req.param("id"))
    if (!s) return c.json({ error: "secret not found" }, 404)
    const versions = await db
      .select({
        version: secretVersion.version,
        createdBy: secretVersion.createdBy,
        createdAt: secretVersion.createdAt,
      })
      .from(secretVersion)
      .where(eq(secretVersion.secretId, s.id))
      .orderBy(desc(secretVersion.version))
    const reads = await db
      .select({
        version: secretAccess.version,
        via: secretAccess.via,
        actor: secretAccess.actor,
        createdAt: secretAccess.createdAt,
      })
      .from(secretAccess)
      .where(eq(secretAccess.secretId, s.id))
      .orderBy(desc(secretAccess.createdAt))
      .limit(100)
    return c.json({ versions, reads })
  })
  .delete("/:id", async (c) => {
    const s = await getSecret(c.req.param("id"))
    if (!s) return c.json({ error: "secret not found" }, 404)
    const using = await connectionsUsing(s)
    if (using.length)
      return c.json(
        {
          error: `connections still use this secret: ${using.map((u) => u.name).join(", ")}`,
        },
        409
      )
    await db.delete(secret).where(eq(secret.id, s.id))
    return c.body(null, 204)
  })
