# API reference

Everything consumers use. All endpoints except `/api/health` take a keyhall token:

```
Authorization: Bearer kh_...
```

| Status | Meaning |
|---|---|
| `401` | No token. |
| `403` | Invalid, expired or revoked token, a token over its rate limit (600 requests per minute), or an operation outside the token's reach. |
| `404` | The connection or secret doesn't exist within the token's reach. |
| `409` | Ambiguous name: the same secret name exists in several reachable projects. Add the project. |

The panel's own API (`/api/admin/*`, `/api/auth/*`, `/api/setup`) is internal and may change
between versions.

## MCP

```
POST https://<host>/mcp
```

[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http),
stateless. Supports `initialize`, `tools/list` and `tools/call`.

Tool names are `<connection>__<tool>`, or `<project>__<connection>__<tool>` when the token reaches
more than one project. Names longer than 50 characters are shortened to fit clients that cap
tool names at 64 characters (including their own prefix); keyhall maps them back on
`tools/call`.

When the token reaches secrets marked "Readable by agents", two more tools appear:

| Tool | Arguments | Returns |
|---|---|---|
| `keyhall__list_secrets` | none | Names, projects and descriptions of readable secrets (no values). |
| `keyhall__get_secret` | `name`, plus `project` when the token reaches several projects | The current value. The read is logged. |

The connection name `keyhall` is reserved for these.

### Code Mode

Tokens in Code Mode list two tools instead:

| Tool | Arguments | Returns |
|---|---|---|
| `search` | `query`, optional `limit` (default 10, max 50) | Matching tools: name, description, and input (and output, when known) as TypeScript types. A connection prefix as `query` lists that connection's tools. |
| `execute` | `code` | The JSON of the value the code returns, followed by its `console.log` output. |

`code` is the body of an async function. `await call("<tool name>", { ...input })` calls a tool
and returns its result: structured content when the tool gives it, otherwise its text, parsed as
JSON when possible. A failed call throws an `Error`.

```js
const apps = await call("dokploy__application-search", { name: "web" })
const stopped = apps.items.filter((a) => a.applicationStatus !== "running")
for (const a of stopped) await call("dokploy__application-start", { applicationId: a.applicationId })
return stopped.map((a) => a.name)
```

Each call goes through the same checks as a direct `tools/call`. The code runs in QuickJS
compiled to WebAssembly, with no network, file system, timers or process access: `call()` is
its only way out. Limits per run: 60 seconds, 100 calls, 128 MB of memory, 4 runs at a time;
output over 24,000 characters is cut.

`/mcp/<scope-slug>` is still accepted for consumers configured with older versions. The token
must belong to that scope.

## Secrets

Reads secrets reachable by the token: those of its organization, of its project, or picked in
its scope. Every read is logged in the secret's history with the token's name.

### List

```bash
curl https://<host>/api/secrets -H "Authorization: Bearer kh_..."
```

```json
[{ "name": "STRIPE_KEY", "project": "shop", "description": "Live key", "version": 3 }]
```

Filter by project with `?project=<slug>`.

### Read one

```bash
curl https://<host>/api/secrets/STRIPE_KEY -H "Authorization: Bearer kh_..."
curl https://<host>/api/secrets/shop/STRIPE_KEY -H "Authorization: Bearer kh_..."
```

```json
{ "name": "STRIPE_KEY", "project": "shop", "version": 3, "value": "sk_live_..." }
```

### All of them as environment variables

`?format=env` returns `NAME='value'` lines, shell-quoted:

```bash
# load into the current shell
set -a; source <(curl -fsS "https://<host>/api/secrets?format=env" -H "Authorization: Bearer $KEYHALL_TOKEN"); set +a

# or into a file for docker --env-file / systemd
curl -fsS "https://<host>/api/secrets?format=env&project=shop" \
  -H "Authorization: Bearer $KEYHALL_TOKEN" > .env
```

Combine with `?project=` when the same name exists in several projects (otherwise `409`).

## Proxy

Calls an **HTTP API connection** with keyhall injecting the stored key:

```
<METHOD> https://<host>/api/proxy/<project>/<connection>/<path>?<query>
```

```bash
curl https://<host>/api/proxy/shop/stripe/v1/customers?limit=3 \
  -H "Authorization: Bearer kh_..."
```

- Method, query string, body, `content-type` and `accept` are forwarded; the response status,
  `content-type` and body come back.
- With an OpenAPI spec, only operations in the spec pass, and only those allowed in the token's
  scope. Without a spec, the scope must include the connection with all tools.
- Paths that would escape the connection's base URL are refused. Requests time out after 30
  seconds.

## Health

```bash
curl https://<host>/api/health
```

```json
{ "ok": true, "version": "0.1.0" }
```

No authentication. Use it for uptime checks and load balancers.
