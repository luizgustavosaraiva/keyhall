import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { decrypt } from "../crypto.js"
import type { connection } from "../db/schema.js"
import { resolveRefs } from "../secrets/store.js"
import { ConnectionOAuthProvider } from "./oauth-provider.js"
import { stdioClient } from "./stdio.js"

type Connection = typeof connection.$inferSelect

// Fixed headers of a remote MCP connection, with vault references resolved.
export function remoteHeaders(conn: Connection): Record<string, string> {
  const headers = decrypt<Record<string, string>>(conn.secretEnc) ?? {}
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      conn.projectId ? resolveRefs(v, conn.projectId) : v,
    ])
  )
}

// A fixed Authorization header replaces OAuth: the upstream takes a key, not a sign-in.
export const hasAuthHeader = (headers: Record<string, string>) =>
  Object.keys(headers).some((k) => k.toLowerCase() === "authorization")

// Opens an MCP session with the upstream, runs fn and closes it. The transport refreshes the
// access token through the provider when it expires. stdio servers reuse the running process.
export async function withUpstream<T>(
  conn: Connection,
  fn: (client: Client) => Promise<T>,
  provider = new ConnectionOAuthProvider(conn)
): Promise<T> {
  if (conn.kind === "stdio") return fn(await stdioClient(conn))
  const headers = remoteHeaders(conn)
  const transport = new StreamableHTTPClientTransport(new URL(conn.url), {
    requestInit: { headers },
    ...(hasAuthHeader(headers) ? {} : { authProvider: provider }),
  })
  const client = new Client({ name: "keyhall", version: "0.1.0" })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}
