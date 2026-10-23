export type StdioConfig = {
  // Key name under mcpServers, when the pasted JSON had one.
  name?: string
  command: string
  args: string[]
  env: Record<string, string>
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v)

function server(value: unknown, name?: string): StdioConfig {
  if (isObject(value) && "url" in value && !("command" in value))
    throw new Error("this is a remote server: use the Remote MCP type")
  if (!isObject(value) || typeof value.command !== "string" || !value.command)
    throw new Error('missing "command"')
  const args = value.args ?? []
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
    throw new Error('"args" must be a list of strings')
  const env = value.env ?? {}
  if (!isObject(env) || Object.values(env).some((v) => typeof v !== "string"))
    throw new Error('"env" must be an object { NAME: "value" }')
  return {
    name,
    command: value.command,
    args: args as string[],
    env: env as Record<string, string>,
  }
}

// Accepts the format most clients use (Claude Code, Claude Desktop, Cursor):
// { "mcpServers": { "name": { command, args, env } } }, VS Code's "servers" variant,
// { "name": { command, … } } or just { command, args, env }.
export function parseStdioConfig(text: string): StdioConfig {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    throw new Error("invalid JSON")
  }
  if (!isObject(doc)) throw new Error("expected a JSON object")
  if ("command" in doc) return server(doc)
  const map = isObject(doc.mcpServers)
    ? doc.mcpServers
    : isObject(doc.servers)
      ? doc.servers
      : doc
  const entries = Object.entries(map)
  if (entries.length !== 1)
    throw new Error(
      entries.length
        ? `the JSON has ${entries.length} servers; paste one per connection`
        : "no server in the JSON"
    )
  const [name, value] = entries[0]
  return server(value, name)
}

export const stdioExample = `{
  "mcpServers": {
    "dokploy": {
      "command": "npx",
      "args": ["-y", "@dokploy/mcp"],
      "env": {
        "DOKPLOY_URL": "https://dokploy.example.com",
        "DOKPLOY_API_KEY": "your-api-key"
      }
    }
  }
}`

// Arguments are stored in plain text and shown in the panel; only env is encrypted. Flags
// those that look like they carry a key: --api-key=…, the value after --token, known prefixes
// or a long opaque string.
const secretFlag =
  /^--?[\w-]*(key|token|secret|password|passwd|pat|auth)[\w-]*$/i
const knownPrefix =
  /^(sk-|sk_|pk_|rk_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abpr]-|kh_|ibk_|AKIA|Bearer\s)/
const opaque = (arg: string) =>
  arg.length >= 32 &&
  /^[A-Za-z0-9_\-+/=]+$/.test(arg) &&
  /[a-z]/i.test(arg) &&
  /\d/.test(arg) &&
  !/^[/.@-]/.test(arg)

export function secretLikeArgs(args: string[]): string[] {
  return args.filter((arg, i) => {
    const [flag, value] = arg.split(/=(.*)/s)
    if (value && secretFlag.test(flag)) return true
    if (i > 0 && secretFlag.test(args[i - 1]) && !arg.startsWith("-"))
      return true
    return knownPrefix.test(arg) || opaque(arg)
  })
}
