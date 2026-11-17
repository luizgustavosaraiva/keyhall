import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import type { Context } from "hono"
import { Hono } from "hono"
import { cors } from "hono/cors"
import * as z from "zod"
import { findTarget } from "../access.js"
import { auth } from "../auth.js"
import { type AdminEnv, requireUser } from "./middleware.js"

// keyhall as the OAuth authorization server of its own MCP endpoint (MCP authorization spec):
// protected resource metadata (RFC 9728), server metadata (RFC 8414), dynamic client
// registration (RFC 7591) and the authorization code flow with PKCE S256. An MCP client
// (agentes.chat, Claude, Cursor…) finds it from the 401 on /mcp, the admin signs in to the panel
// and picks what the client reaches, and the client gets a regular keyhall token: it shows on
// the Tokens page and is revoked there.
//
// Nothing new is stored: a registered client is its signed client_id, and pending codes live in
// memory for ten minutes.

const CODE_TTL = 10 * 60_000
const MAX_CODES = 1000

const signingKey = () => process.env.BETTER_AUTH_SECRET ?? ""
// Where the admin signs in and approves: the panel.
const panelUrl = () => (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")

// The origin the client used: the panel's address or a public one in front of /mcp only.
export function requestOrigin(c: Context) {
  const url = new URL(c.req.url)
  const proto =
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ??
    url.protocol.slice(0, -1)
  const host =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ??
    c.req.header("host") ??
    url.host
  return `${proto}://${host}`
}

export const resourceMetadataUrl = (c: Context) =>
  `${requestOrigin(c)}/.well-known/oauth-protected-resource/mcp`

const b64url = (data: Buffer | string) =>
  Buffer.from(data).toString("base64url")
const sign = (payload: string) =>
  createHmac("sha256", signingKey())
    .update(`mcp-oauth-client:${payload}`)
    .digest("base64url")

type Client = { name: string; redirectUris: string[] }

function clientIdFor(client: Client) {
  const payload = b64url(
    JSON.stringify({ n: client.name, r: client.redirectUris })
  )
  return `${payload}.${sign(payload)}`
}

function readClient(clientId: string | undefined): Client | undefined {
  const [payload, mac] = (clientId ?? "").split(".")
  if (!payload || !mac) return
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return
  try {
    const { n, r } = JSON.parse(Buffer.from(payload, "base64url").toString())
    return { name: String(n), redirectUris: (r as unknown[]).map(String) }
  } catch {
    return
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

// https anywhere, http only on the loopback (CLI clients), or an app's own scheme (cursor://).
function allowedRedirect(raw: string) {
  try {
    const url = new URL(raw)
    if (url.hash) return false
    if (url.protocol === "https:") return true
    if (url.protocol === "http:") return LOOPBACK.has(url.hostname)
    return !["javascript:", "data:", "file:", "blob:", "vbscript:"].includes(
      url.protocol
    )
  } catch {
    return false
  }
}

// Exact match, except the port of a loopback address, which native apps pick per run (RFC 8252).
function redirectMatches(client: Client, raw: string) {
  return client.redirectUris.some((registered) => {
    if (registered === raw) return true
    try {
      const a = new URL(registered)
      const b = new URL(raw)
      return (
        a.protocol === "http:" &&
        LOOPBACK.has(a.hostname) &&
        a.hostname === b.hostname &&
        a.protocol === b.protocol &&
        a.pathname === b.pathname &&
        a.search === b.search
      )
    } catch {
      return false
    }
  })
}

type Target = { kind: "org" | "project" | "scope" | "member"; id: string }

type PendingCode = {
  clientId: string
  clientName: string
  redirectUri: string
  challenge: string
  target: Target
  mode: "tools" | "code"
  userId: string
  expires: number
}

const codes = new Map<string, PendingCode>()

function storeCode(entry: PendingCode) {
  const now = Date.now()
  for (const [code, pending] of codes)
    if (pending.expires < now) codes.delete(code)
  while (codes.size >= MAX_CODES) codes.delete(codes.keys().next().value ?? "")
  const code = b64url(randomBytes(32))
  codes.set(code, entry)
  return code
}

const authorizeParams = z.object({
  response_type: z.literal("code", "only response_type=code is supported"),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256", "PKCE with S256 is required"),
  state: z.string().max(2000).optional(),
  scope: z.string().optional(),
  resource: z.string().optional(),
})

// Checks an authorization request; the error is shown on the consent page, never redirected
// (an unknown client or redirect_uri must not become an open redirect).
function checkRequest(input: unknown) {
  const parsed = authorizeParams.safeParse(input)
  if (!parsed.success) return { error: z.prettifyError(parsed.error) } as const
  const params = parsed.data
  const client = readClient(params.client_id)
  if (!client) return { error: "unknown client" } as const
  if (!redirectMatches(client, params.redirect_uri))
    return { error: "redirect_uri not registered for this client" } as const
  return { params, client } as const
}

function redirectWith(
  redirectUri: string,
  values: Record<string, string | undefined>
) {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(values))
    if (v !== undefined) url.searchParams.set(k, v)
  return url.toString()
}

// The approver must still reach the target: admins anything, members only their grants.
const canTarget = async (userId: string, { kind, id }: Target) =>
  !!(await findTarget(userId, { [kind]: [id] }))

const publicCors = cors({
  origin: "*",
  allowHeaders: ["content-type", "authorization", "mcp-protocol-version"],
})

// Public part: metadata, registration and token, called by the MCP client (often from its own
// servers, so on the public address too).
export const mcpOAuth = new Hono()
  // Mounted at the root: CORS only on these paths (browser-based clients), not on the panel.
  .use("/.well-known/oauth-*", publicCors)
  .use("/oauth/register", publicCors)
  .use("/oauth/token", publicCors)
  .get("/.well-known/oauth-protected-resource/*", (c) => resourceDoc(c))
  .get("/.well-known/oauth-protected-resource", (c) => resourceDoc(c))
  .get("/.well-known/oauth-authorization-server/*", (c) => serverDoc(c))
  .get("/.well-known/oauth-authorization-server", (c) => serverDoc(c))
  .post("/oauth/register", async (c) => {
    const body = await c.req.json().catch(() => null)
    const input = z
      .object({
        redirect_uris: z.array(z.string().max(500)).min(1).max(10),
        client_name: z.string().trim().max(100).optional(),
      })
      .safeParse(body)
    if (!input.success)
      return c.json(
        {
          error: "invalid_client_metadata",
          error_description: z.prettifyError(input.error),
        },
        400
      )
    const bad = input.data.redirect_uris.filter((u) => !allowedRedirect(u))
    if (bad.length)
      return c.json(
        {
          error: "invalid_redirect_uri",
          error_description: `redirect_uri not allowed: ${bad.join(", ")}`,
        },
        400
      )
    const client: Client = {
      name: input.data.client_name || new URL(input.data.redirect_uris[0]).host,
      redirectUris: input.data.redirect_uris,
    }
    return c.json(
      {
        client_id: clientIdFor(client),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201
    )
  })
  .post("/oauth/token", async (c) => {
    c.header("cache-control", "no-store")
    const type = c.req.header("content-type") ?? ""
    const body = (
      type.includes("application/json")
        ? await c.req.json().catch(() => ({}))
        : await c.req.parseBody()
    ) as Record<string, unknown>
    const fail = (error: string, description: string) =>
      c.json({ error, error_description: description }, 400)
    if (body.grant_type !== "authorization_code")
      return fail(
        "unsupported_grant_type",
        "only authorization_code is supported"
      )
    const code = String(body.code ?? "")
    const pending = codes.get(code)
    codes.delete(code)
    if (!pending || pending.expires < Date.now())
      return fail("invalid_grant", "unknown or expired code")
    if (body.client_id !== undefined && body.client_id !== pending.clientId)
      return fail("invalid_grant", "code issued to another client")
    if (body.redirect_uri !== pending.redirectUri)
      return fail("invalid_grant", "redirect_uri does not match")
    const verifier = String(body.code_verifier ?? "")
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    if (verifier.length < 43 || challenge !== pending.challenge)
      return fail("invalid_grant", "PKCE verification failed")
    if (!(await canTarget(pending.userId, pending.target)))
      return fail("invalid_grant", "the approved target no longer exists")
    const created = await auth.api.createApiKey({
      body: {
        name: `${pending.clientName} (OAuth)`.slice(0, 120),
        userId: pending.userId,
        permissions: { [pending.target.kind]: [pending.target.id] },
        metadata: { mode: pending.mode, oauth: true },
        expiresIn: null,
      },
    })
    return c.json({
      access_token: created.key,
      token_type: "Bearer",
      scope: "mcp",
    })
  })

function resourceDoc(c: Context) {
  const origin = requestOrigin(c)
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "keyhall",
  })
}

function serverDoc(c: Context) {
  const origin = requestOrigin(c)
  return c.json({
    issuer: origin,
    // The admin approves in the panel, wherever the client found keyhall.
    authorization_endpoint: `${panelUrl() || origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  })
}

// Panel part: the consent page checks the request, then approves or denies it.
const decision = z.object({ request: z.record(z.string(), z.string()) })

export const mcpOAuthConsent = new Hono<AdminEnv>()
  .use("*", requireUser)
  .post("/check", async (c) => {
    const checked = checkRequest(await c.req.json())
    if ("error" in checked) return c.json({ error: checked.error }, 400)
    return c.json({
      client: checked.client.name,
      redirectHost: new URL(checked.params.redirect_uri).host,
    })
  })
  .post("/approve", async (c) => {
    const input = decision
      .extend({
        target: z.object({
          kind: z.enum(["org", "project", "scope", "member"]),
          id: z.string().min(1),
        }),
        mode: z.enum(["tools", "code"]).default("tools"),
      })
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const checked = checkRequest(input.data.request)
    if ("error" in checked) return c.json({ error: checked.error }, 400)
    if (!(await canTarget(c.get("session").user.id, input.data.target)))
      return c.json({ error: "token target not found" }, 404)
    const { params, client } = checked
    const code = storeCode({
      clientId: params.client_id,
      clientName: client.name,
      redirectUri: params.redirect_uri,
      challenge: params.code_challenge,
      target: input.data.target,
      mode: input.data.mode,
      userId: c.get("session").user.id,
      expires: Date.now() + CODE_TTL,
    })
    return c.json({
      redirect: redirectWith(params.redirect_uri, {
        code,
        state: params.state,
      }),
    })
  })
  .post("/deny", async (c) => {
    const input = decision.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const checked = checkRequest(input.data.request)
    if ("error" in checked) return c.json({ error: checked.error }, 400)
    return c.json({
      redirect: redirectWith(checked.params.redirect_uri, {
        error: "access_denied",
        state: checked.params.state,
      }),
    })
  })
