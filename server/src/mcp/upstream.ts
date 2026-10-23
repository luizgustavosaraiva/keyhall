import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { connection } from "../db/schema.js"
import { ConnectionOAuthProvider } from "./oauth-provider.js"
import { stdioClient } from "./stdio.js"

type Connection = typeof connection.$inferSelect

// Opens an MCP session with the upstream, runs fn and closes it. The transport refreshes the
// access token through the provider when it expires. stdio servers reuse the running process.
export async function withUpstream<T>(
  conn: Connection,
  fn: (client: Client) => Promise<T>,
  provider = new ConnectionOAuthProvider(conn)
): Promise<T> {
  if (conn.kind === "stdio") return fn(await stdioClient(conn))
  const transport = new StreamableHTTPClientTransport(new URL(conn.url), {
    authProvider: provider,
  })
  const client = new Client({ name: "keyhall", version: "0.1.0" })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}
