# Architecture

For contributors: how keyhall is put together and where to find each piece.

```
consumer (Claude Code, an agent, a script)
   │  Authorization: Bearer kh_…
   ▼
keyhall ── /mcp            MCP gateway (Streamable HTTP, stateless)
       ── /api/proxy/…     HTTP proxy for API connections
       ── /api/secrets/…   secrets for scripts and CI
       ── /               panel (React SPA) + /api/admin, /api/auth
   │  OAuth token / API key / env, decrypted at use time
   ▼
upstream: remote MCP servers · local MCP processes · HTTP APIs
```

One Node.js process serves everything; state is a single SQLite file.

## Stack

| Layer | Packages |
|---|---|
| Runtime | Node.js ≥ 24, TypeScript, ES modules |
| Server | [Hono](https://hono.dev) on `@hono/node-server` |
| MCP | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk): server transport for the gateway, client (with `OAuthClientProvider`) for upstreams |
| Auth | [Better Auth](https://better-auth.com) with the `admin` and `@better-auth/api-key` plugins |
| Database | SQLite through `better-sqlite3` and [Drizzle ORM](https://orm.drizzle.team); migrations by `drizzle-kit` |
| Panel | React 19, Vite, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) on Base UI, lucide icons |
| Tooling | pnpm workspace (`server`, `web`), [Biome](https://biomejs.dev) for lint and format |

pnpm blocks dependency install scripts; only `esbuild` and `better-sqlite3` are allowed, in
`pnpm-workspace.yaml`.

## Layout

```
server/
  src/
    index.ts              routes, token middleware, static panel
    access.ts             token → target (org | project | scope) → reachable connections
    auth.ts               Better Auth setup (sessions, admin, api-key tokens)
    crypto.ts             AES-256-GCM helpers, master key from KEYHALL_ENCRYPTION_KEY
    db/                   Drizzle schema (auth-schema.ts is generated) and migrator
    mcp/
      gateway.ts          aggregates tools, applies scopes, forwards calls, secret tools
      code-mode.ts        Code Mode: search and execute tools
      sandbox.ts          QuickJS (WebAssembly) sandbox that runs execute's code
      upstream.ts         MCP client per connection
      oauth-provider.ts   OAuth client state, stored encrypted on the connection row
      stdio.ts            pool of local MCP processes
    api/openapi.ts        OpenAPI spec → tools, auth headers for API connections
    secrets/store.ts      secret envelope encryption, {{secret:…}} references, access log
    routes/               admin, admin-secrets, setup, oauth callback, proxy, secrets
    scripts/              backup, reset-password, rotate-key, create-admin
  drizzle/                SQL migrations, applied on startup
web/
  src/
    pages/                connections, scopes, secrets, tokens, login, setup
    components/           app components; components/ui holds shadcn components
    locales/              en.ts (default), pt.ts
    lib/                  API client, i18n, helpers
  test/                   end-to-end tests (node:test) against the built server, with fixtures
deploy/                   compose files (default, Caddy, Tailscale) and systemd unit
```

## Data model

- `organization` → `project` → `connection` and `secret`.
- `scope` belongs to a project, or to the organization (then it may combine projects).
  `scope_connection.allowed_tools` is `null` for "all tools, including future ones", or a list.
  `scope_secret` lists the secrets a scope may read.
- Tokens are Better Auth API keys (prefix `kh_`) whose `permissions` hold the target:
  `{ org: [id] }`, `{ project: [id] }` or `{ scope: [id] }`.
- `secret_version` keeps every value: `value_enc` (encrypted with a random data key) and
  `key_enc` (that data key encrypted with the master key). `secret_access` logs every read.

## Request flow (MCP)

1. `requireToken` verifies the token with Better Auth and resolves its target
   (`access.ts`): the list of reachable connections, with each scope's tool filter.
2. The gateway creates a stateless MCP server for the request. `tools/list` asks each
   reachable upstream for its tools (in parallel), prefixes them, and drops those the scope
   doesn't allow.
3. `tools/call` maps the name back to the connection and tool, checks the scope again, and
   forwards the call with the decrypted credential.

In Code Mode, `tools/list` returns `search` and `execute`. `search` ranks the same tool list
(upstream lists are cached for a minute). `execute` runs the code in a fresh QuickJS instance,
and each `call()` from the code goes through step 3.

## Connections

- **Remote MCP:** keyhall is an OAuth client of each upstream (dynamic client registration,
  PKCE). Client info, tokens and discovery state live on the connection row, encrypted. When
  the upstream answers 401, the panel sends the administrator to authorize; the callback is
  `/api/oauth/callback`. A connection may instead carry fixed headers (encrypted, with
  `{{secret:…}}` references resolved per request); a fixed `Authorization` turns OAuth off for it.
- **Local:** the `mcpServers` JSON is parsed into command, args and env. The env is encrypted;
  `{{secret:…}}` references are resolved when the process starts. One long-lived process per
  connection; the pool key is a hash of command, args and resolved env, so changing any of them
  (including a referenced secret) restarts the process. Disabled when
  `KEYHALL_ALLOW_STDIO=false`.
- **HTTP API:** the key goes into the configured header. With an OpenAPI 3 spec (JSON, also
  JSON wrapped in JS as some Swagger UIs serve it), each operation becomes a tool named after
  its `operationId`. If the key matches one of the spec's security schemes, only operations
  accepting that scheme are exposed.

## Conventions

- Server messages and logs are in English. Panel strings live in `web/src/locales`; add every
  new key to both `en.ts` and `pt.ts`.
- Schema changes: edit `server/src/db/app-schema.ts`, then `pnpm --filter server db:generate`
  and commit the generated migration. Never edit a migration that was released.
- Never log or return decrypted credentials, except where the feature is reading a secret (and
  then log the access).
