import { createMiddleware } from "hono/factory"
import { auth } from "../auth.js"

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

export type AdminEnv = { Variables: { session: Session } }

export const requireAdmin = createMiddleware<AdminEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: "not authenticated" }, 401)
  if (session.user.role !== "admin")
    return c.json({ error: "access denied" }, 403)
  c.set("session", session)
  await next()
})
