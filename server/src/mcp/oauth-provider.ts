import { randomBytes } from "node:crypto"
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import { eq } from "drizzle-orm"
import { decrypt, encrypt } from "../crypto.js"
import { db } from "../db/index.js"
import { connection } from "../db/schema.js"

type Connection = typeof connection.$inferSelect

export function oauthRedirectUrl() {
  const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787"
  return new URL("/api/oauth/callback", base).toString()
}

// keyhall as the OAuth client of an upstream MCP server. Everything is persisted on the
// connection row (encrypted), so tokens and the dynamic client registration survive restarts.
export class ConnectionOAuthProvider implements OAuthClientProvider {
  /** Set when the upstream requires the admin to authorize in the browser. */
  authorizationUrl?: URL

  constructor(private conn: Connection) {}

  private async save(values: Partial<Connection>) {
    Object.assign(this.conn, values)
    await db
      .update(connection)
      .set(values)
      .where(eq(connection.id, this.conn.id))
  }

  get redirectUrl() {
    return oauthRedirectUrl()
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "keyhall",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }
  }

  async state() {
    const state = `${this.conn.id}.${randomBytes(16).toString("base64url")}`
    await this.save({ oauthState: state })
    return state
  }

  clientInformation() {
    return decrypt<OAuthClientInformationMixed>(this.conn.clientInfoEnc)
  }

  async saveClientInformation(info: OAuthClientInformationMixed) {
    await this.save({ clientInfoEnc: encrypt(info) })
  }

  tokens() {
    return decrypt<OAuthTokens>(this.conn.tokensEnc)
  }

  async saveTokens(tokens: OAuthTokens) {
    await this.save({ tokensEnc: encrypt(tokens) })
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url
  }

  async saveCodeVerifier(verifier: string) {
    await this.save({ codeVerifierEnc: encrypt(verifier) })
  }

  codeVerifier() {
    const verifier = decrypt<string>(this.conn.codeVerifierEnc)
    if (!verifier)
      throw new Error("missing code verifier; restart the connection")
    return verifier
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    await this.save({ discoveryEnc: encrypt(state) })
  }

  discoveryState() {
    return decrypt<OAuthDiscoveryState>(this.conn.discoveryEnc)
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery"
  ) {
    const all = scope === "all"
    await this.save({
      ...(all || scope === "client" ? { clientInfoEnc: null } : {}),
      ...(all || scope === "tokens" ? { tokensEnc: null } : {}),
      ...(all || scope === "verifier" ? { codeVerifierEnc: null } : {}),
      ...(all || scope === "discovery" ? { discoveryEnc: null } : {}),
    })
  }
}
