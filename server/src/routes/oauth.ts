import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db/index.js"
import { connection } from "../db/schema.js"
import { ConnectionOAuthProvider } from "../mcp/oauth-provider.js"
import { type AdminEnv, requireAdmin } from "./middleware.js"

// Browser callback after the admin authorizes keyhall at the upstream.
export const oauth = new Hono<AdminEnv>().get(
  "/callback",
  requireAdmin,
  async (c) => {
    const { code, state, error } = c.req.query()
    const id = state?.split(".")[0]
    const [conn] = id
      ? await db.select().from(connection).where(eq(connection.id, id))
      : []
    if (!conn || !state || conn.oauthState !== state) {
      return c.redirect("/?oauth=estado-invalido")
    }
    const fail = async (message: string) => {
      await db
        .update(connection)
        .set({ status: "error", lastError: message, oauthState: null })
        .where(eq(connection.id, conn.id))
      return c.redirect(`/?oauth=erro&conexao=${conn.slug}`)
    }
    if (error || !code) return fail(error ?? "no authorization code")
    try {
      const provider = new ConnectionOAuthProvider(conn)
      await auth(provider, { serverUrl: conn.url, authorizationCode: code })
      await db
        .update(connection)
        .set({
          status: "connected",
          lastError: null,
          oauthState: null,
          codeVerifierEnc: null,
        })
        .where(eq(connection.id, conn.id))
      return c.redirect(`/?oauth=ok&conexao=${conn.slug}`)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }
)
