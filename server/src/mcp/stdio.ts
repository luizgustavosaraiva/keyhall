import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { decrypt } from "../crypto.js"
import type { connection } from "../db/schema.js"
import { resolveRefs } from "../secrets/store.js"

type Connection = typeof connection.$inferSelect

// stdio connections run an arbitrary command inside the server. Hosts can turn them off with
// KEYHALL_ALLOW_STDIO=false; they are on by default.
export const stdioAllowed = process.env.KEYHALL_ALLOW_STDIO !== "false"

// stdio servers stay alive between requests: starting "npx -y package" on every call
// costs seconds. One process per connection; changing command, args or env replaces it.
const pool = new Map<string, { config: string; client: Promise<Client> }>()

// The first "npx -y" downloads the package; later starts are fast.
const START_TIMEOUT = 120_000

// Environment with vault references resolved.
function envOf(conn: Connection) {
  const env = decrypt<Record<string, string>>(conn.secretEnc) ?? {}
  return Object.fromEntries(
    Object.entries(env).map(([k, v]) => [
      k,
      conn.projectId ? resolveRefs(v, conn.projectId) : v,
    ])
  )
}

// Hash of the effective config: changing a referenced secret also restarts the process.
const configOf = (conn: Connection, env: Record<string, string>) =>
  createHash("sha256")
    .update(JSON.stringify([conn.command, conn.args, env]))
    .digest("hex")

async function start(
  conn: Connection,
  env: Record<string, string>
): Promise<Client> {
  if (!stdioAllowed)
    throw new Error(
      "local connections are disabled (KEYHALL_ALLOW_STDIO=false)"
    )
  if (!conn.command) throw new Error("stdio connection without a command")
  const transport = new StdioClientTransport({
    command: conn.command,
    args: conn.args ?? [],
    // The SDK passes only HOME, PATH and similar from keyhall; the rest of its env doesn't leak.
    env,
    cwd: tmpdir(),
    stderr: "pipe",
  })
  // Keeps the tail of stderr to explain startup failures (missing package, missing variable).
  let stderr = ""
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000)
  })
  const client = new Client({ name: "keyhall", version: "0.1.0" })
  client.onclose = () => {
    if (pool.get(conn.id)?.client === current) pool.delete(conn.id)
  }
  const current = (async () => {
    try {
      await client.connect(transport, { timeout: START_TIMEOUT })
      return client
    } catch (err) {
      await client.close().catch(() => {})
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(stderr.trim() ? `${message}\n${stderr.trim()}` : message)
    }
  })()
  return current
}

export function stdioClient(conn: Connection): Promise<Client> {
  let env: Record<string, string>
  try {
    env = envOf(conn)
  } catch (err) {
    return Promise.reject(err)
  }
  const config = configOf(conn, env)
  const entry = pool.get(conn.id)
  if (entry?.config === config) return entry.client
  if (entry) stopStdio(conn.id)
  const client = start(conn, env)
  pool.set(conn.id, { config, client })
  // Failed to start: the next call tries again.
  client.catch(() => {
    if (pool.get(conn.id)?.client === client) pool.delete(conn.id)
  })
  return client
}

export function stopStdio(id: string) {
  const entry = pool.get(id)
  if (!entry) return
  pool.delete(id)
  entry.client.then((c) => c.close()).catch(() => {})
}
