import "./http.js"
import { readFileSync } from "node:fs"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import { type Access, resolveToken } from "./access.js"
import { auth } from "./auth.js"
import { assertEncryptionKey } from "./crypto.js"
import { runMigrations } from "./db/migrate.js"
import { handleMcp } from "./mcp/gateway.js"
import { admin } from "./routes/admin.js"
import { adminSecrets } from "./routes/admin-secrets.js"
import {
  mcpOAuth,
  mcpOAuthConsent,
  resourceMetadataUrl,
} from "./routes/mcp-oauth.js"
import { oauth } from "./routes/oauth.js"
import { proxy } from "./routes/proxy.js"
import { secretsApi } from "./routes/secrets.js"
import { announceSetup, setup } from "./routes/setup.js"

assertEncryptionKey()
runMigrations()
await announceSetup()

// The root package.json holds the release version (src/ and dist/ sit at the same depth).
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version: string }

const app = new Hono()

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
app.get("/api/health", (c) => c.json({ ok: true, version }))
app.route("/api/admin/secrets", adminSecrets)
app.route("/api/admin", admin)
app.route("/api/setup", setup)
app.route("/api/oauth", oauth)
app.route("/api/mcp-oauth", mcpOAuthConsent)
// OAuth for MCP clients: metadata, client registration and token (see mcp-oauth.ts).
app.route("/", mcpOAuth)

// Consumers send the token as Authorization: Bearer kh_... The token decides the reach:
// the organization, a project or a scope.
const requireToken = createMiddleware<{ Variables: { access: Access } }>(
  async (c, next) => {
    // On /mcp, a 401 tells MCP clients where to get a token by OAuth (RFC 9728).
    const isMcp = c.req.path === "/mcp" || c.req.path.startsWith("/mcp/")
    const challenge = (error?: string) =>
      c.header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl(c)}"${error ? `, error="${error}"` : ""}`
      )
    const key = c.req.header("authorization")?.replace(/^Bearer\s+/i, "")
    if (!key) {
      if (isMcp) challenge()
      return c.json({ error: "missing token" }, 401)
    }
    const access = await resolveToken(key)
    if (!access) {
      // A revoked or expired token on /mcp: 401 so the client signs in again.
      if (!isMcp) return c.json({ error: "invalid token" }, 403)
      challenge("invalid_token")
      return c.json({ error: "invalid token" }, 401)
    }
    // Legacy /mcp/<scope> URL: the token's scope must be the one in the URL.
    const slug = c.req.param("scope")
    if (
      slug &&
      (access.target.kind !== "scope" || access.target.scope.slug !== slug)
    )
      return c.json({ error: "token not valid for this scope" }, 403)
    c.set("access", access)
    await next()
  }
)

// MCP endpoint. /mcp/<scope> keeps working for consumers configured that way.
app.all("/mcp", requireToken, (c) => handleMcp(c.get("access"), c.req.raw))
app.all("/mcp/:scope", requireToken, (c) =>
  handleMcp(c.get("access"), c.req.raw)
)

// HTTP route for API connections: keyhall injects the key and forwards.
app.use("/api/proxy/*", requireToken)
app.route("/api/proxy", proxy)

// Vault for machines (scripts, CI, deploys): the token decides which secrets it reaches.
app.use("/api/secrets/*", requireToken)
app.use("/api/secrets", requireToken)
app.route("/api/secrets", secretsApi)

// In production the panel (web/dist) is served by the same process.
app.use("/*", serveStatic({ root: "../web/dist" }))
app.get("*", serveStatic({ path: "../web/dist/index.html" }))

const port = Number(process.env.PORT ?? 8787)
serve(
  { fetch: app.fetch, port, hostname: process.env.HOST ?? "127.0.0.1" },
  (info) => {
    console.log(`keyhall listening on http://${info.address}:${info.port}`)
  }
)
