import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { decrypt, encrypt } from "../crypto.js"
import { db } from "../db/index.js"
import { connection } from "../db/schema.js"
import { oauthRedirectUrl } from "../mcp/oauth-provider.js"
import { resolveRefs } from "../secrets/store.js"
import type { NativeContext, NativePlugin, OAuth2Config } from "./types.js"

type Connection = typeof connection.$inferSelect

// OAuth 2.0 with a client the admin registered at the provider (no dynamic registration).
// Used by native plugins; remote MCP servers go through the MCP SDK instead.

type Tokens = {
  access_token: string
  refresh_token?: string
  // Epoch ms.
  expires_at: number
  scope?: string
  account?: string
}

// Field values, with vault references resolved.
export function fieldValues(conn: Connection): Record<string, string> {
  const stored = decrypt<Record<string, string>>(conn.secretEnc) ?? {}
  return Object.fromEntries(
    Object.entries(stored).map(([k, v]) => [
      k,
      conn.projectId ? resolveRefs(v, conn.projectId) : v,
    ])
  )
}

export const nativeFeatures = (conn: Connection, plugin: NativePlugin) => {
  const chosen = conn.config?.features ?? []
  return plugin.features.map((f) => f.id).filter((id) => chosen.includes(id))
}

const configOf = (conn: Connection, plugin: NativePlugin) =>
  plugin.oauth(fieldValues(conn), nativeFeatures(conn, plugin))

export const nativeAccount = (conn: Connection) =>
  decrypt<Tokens>(conn.tokensEnc)?.account ?? null

async function save(conn: Connection, values: Partial<Connection>) {
  Object.assign(conn, values)
  await db.update(connection).set(values).where(eq(connection.id, conn.id))
}

export async function authorizationUrl(conn: Connection, plugin: NativePlugin) {
  const config = configOf(conn, plugin)
  const state = `${conn.id}.${randomBytes(16).toString("base64url")}`
  await save(conn, { oauthState: state })
  const url = new URL(config.authorizeUrl)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: oauthRedirectUrl(),
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    ...config.params,
  }).toString()
  return url
}

class GrantError extends Error {}

async function tokenRequest(
  config: OAuth2Config,
  params: Record<string, string>
) {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !body.access_token) {
    const message = `token request failed: ${body.error ?? res.status}${
      body.error_description ? ` (${body.error_description})` : ""
    }`
    // invalid_grant: the refresh token was revoked or expired; only a new sign-in helps.
    throw body.error === "invalid_grant"
      ? new GrantError(message)
      : new Error(message)
  }
  return body as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }
}

async function fetchAccount(config: OAuth2Config, accessToken: string) {
  if (!config.accountUrl) return undefined
  const res = await fetch(config.accountUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return undefined
  const info = (await res.json()) as Record<string, unknown>
  const value = info[config.accountField ?? "email"]
  return typeof value === "string" ? value : undefined
}

// Without expires_in the token is treated as valid for an hour.
const expiry = (seconds?: number) => Date.now() + (seconds ?? 3600) * 1000

export async function exchangeCode(
  conn: Connection,
  plugin: NativePlugin,
  code: string
) {
  const config = configOf(conn, plugin)
  const t = await tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthRedirectUrl(),
  })
  if (!t.refresh_token)
    throw new Error(
      "the provider returned no refresh token; remove keyhall's access in your account and connect again"
    )
  const tokens: Tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: expiry(t.expires_in),
    scope: t.scope,
    account: await fetchAccount(config, t.access_token),
  }
  await save(conn, { tokensEnc: encrypt(tokens) })
}

// Refreshes a minute before expiry. Concurrent calls of one connection share the refresh.
const refreshing = new Map<string, Promise<string>>()

export async function accessToken(
  conn: Connection,
  plugin: NativePlugin
): Promise<string> {
  const tokens = decrypt<Tokens>(conn.tokensEnc)
  if (!tokens?.refresh_token)
    throw new Error("connection not authorized; connect it in the panel")
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token
  const pending = refreshing.get(conn.id)
  if (pending) return pending
  const run = (async () => {
    try {
      const t = await tokenRequest(configOf(conn, plugin), {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token as string,
      })
      const next: Tokens = {
        ...tokens,
        access_token: t.access_token,
        // Providers usually keep the refresh token; store a new one when they send it.
        refresh_token: t.refresh_token ?? tokens.refresh_token,
        expires_at: expiry(t.expires_in),
      }
      await save(conn, { tokensEnc: encrypt(next) })
      return next.access_token
    } catch (err) {
      if (err instanceof GrantError)
        await save(conn, {
          status: "error",
          lastError: `${err.message}. Connect again in the panel.`,
        })
      throw err
    } finally {
      refreshing.delete(conn.id)
    }
  })()
  refreshing.set(conn.id, run)
  return run
}

// Authenticated requests for the plugin's tools. Errors carry the provider's message, which
// usually says what to fix (an API not enabled, a missing scope).
export function nativeContext(
  conn: Connection,
  plugin: NativePlugin
): NativeContext {
  const send = async (url: string, init: RequestInit = {}) => {
    const token = await accessToken(conn, plugin)
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${token}`)
    const res = await fetch(url, { ...init, headers })
    if (!res.ok) {
      const text = await res.text()
      let message = text.slice(0, 500)
      try {
        const body = JSON.parse(text) as { error?: { message?: string } }
        if (body.error?.message) message = body.error.message
      } catch {}
      throw new Error(`HTTP ${res.status}: ${message}`)
    }
    return res
  }
  return {
    fetch: send,
    json: async <T>(url: string, init?: RequestInit) =>
      (await send(url, init)).json() as Promise<T>,
  }
}

// Checks the stored tokens work, refreshing them if needed.
export async function checkTokens(conn: Connection, plugin: NativePlugin) {
  const token = await accessToken(conn, plugin)
  const config = configOf(conn, plugin)
  if (config.accountUrl && !(await fetchAccount(config, token)))
    throw new Error("the provider rejected the access token")
}
