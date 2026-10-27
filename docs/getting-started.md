# Getting started

From an empty install to an AI agent calling tools through keyhall, in about ten minutes.

You need a running keyhall. If you don't have one yet, follow
[Deploy with Docker](deploy/docker.md) (or [from source](deploy/from-source.md)) and come back
when the log shows the setup code.

## 1. Create the administrator account

Open keyhall in the browser. The first screen asks for:

- the **setup code** printed in the server log (`docker compose logs keyhall`);
- your name, e-mail and password;
- the name of your first **organization** (you can rename it later).

This account is the administrator. Sign-up closes for good after it, so nobody else can create
an account on your instance.

keyhall also creates a project called **Default** inside the organization. Rename it or create
others from the project menu at the top of the sidebar. If the words organization, project,
scope and token are new to you, read [Concepts](concepts.md) first. It's short.

## 2. Add a connection

Go to **Connections → New connection** and pick a type.

### A remote MCP server

1. Type: **Remote MCP**.
2. Name: `cloudflare-docs`. The name becomes the tool prefix (`cloudflare-docs__search…`).
3. Server URL: `https://docs.mcp.cloudflare.com/mcp` (a public server that needs no login,
   good for a first test).
4. Create.

For servers that need a login, keyhall opens the provider's authorization page right after you
create the connection. Approve it and you're back in the panel with the connection marked
**Connected**. keyhall keeps and refreshes that authorization; your consumers never see it.

Click the connection card, then **Tools**, to browse what it offers. Click a tool to see its
description and parameters.

### A local MCP server (command)

Many MCP servers are distributed as an `npx` command. Their README usually shows a block like
this for Claude Desktop or Cursor. Paste it as is:

```json
{
  "mcpServers": {
    "example": {
      "command": "npx",
      "args": ["-y", "@vendor/example-mcp"],
      "env": { "EXAMPLE_API_KEY": "your-key" }
    }
  }
}
```

keyhall runs the process on the server and keeps it alive. The `env` values are encrypted;
`args` are not, so never put keys in `args`. The panel warns you when an argument looks like
one. Run only packages you trust: see [Security](security.md#local-connections).

### An HTTP API

For APIs that don't have an MCP server:

1. Type: **HTTP API**.
2. Base URL of the API, the header that carries the key (e.g. `Authorization` with the
   `Bearer ` prefix, or `X-API-Key`) and the key itself.
3. Optionally the URL of its **OpenAPI 3 spec** (JSON). Each operation becomes an MCP tool;
   without a spec the API is available only through the [proxy](api.md#proxy).

## 3. Store keys as secrets (recommended)

Instead of typing a key into each connection, store it once:

1. **Secrets → New secret**, e.g. `EXAMPLE_API_KEY`.
2. In the connection's key field, or in its `env`, click the lock icon and pick the secret. The
   field shows `{{secret:EXAMPLE_API_KEY}}`.

Now rotating the key is a single change in **Secrets**, and every connection that references it
picks up the new value right away.

## 4. Create a scope

Skip this step if the consumer may see everything in a project.

1. **Scopes → New scope**, e.g. `support-bot`.
2. Tick the connections it may use. For each one, keep **all tools** or pick only some (for
   example, only the read tools).
3. Optionally tick secrets it may read.

## 5. Create a token

1. **Tokens → New token**.
2. Name it after the consumer, e.g. `Claude Code (laptop)`.
3. Choose what it reaches: the whole **organization**, one **project**, or one **scope**.
4. Choose the tool mode. Keep **Code Mode** unless the consumer only reaches a few tools: see
   [Concepts](concepts.md#token).
5. Choose an expiry, then **Create token**.

The token (`kh_…`) is shown **once**. The dialog also shows ready-to-paste configuration for the
consumer.

## 6. Connect a consumer

The endpoint is the same for every consumer: `https://<your-keyhall>/mcp`.

**Claude Code**

```bash
claude mcp add --transport http --scope user keyhall https://<your-keyhall>/mcp \
  --header "Authorization: Bearer kh_..."
```

**Clients configured with JSON** (`mcpServers` format):

```json
{
  "mcpServers": {
    "keyhall": {
      "type": "http",
      "url": "https://<your-keyhall>/mcp",
      "headers": { "Authorization": "Bearer kh_..." }
    }
  }
}
```

**Check it with curl**

```bash
curl -X POST https://<your-keyhall>/mcp \
  -H "Authorization: Bearer kh_..." \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The consumer now lists only the tools its token reaches, all with the connection prefix.

## Next steps

- Add the rest of your services and one token per consumer.
- Open the panel on your phone: **Sign in on a phone** in the account menu shows a QR code.
- Set up [backups](operations.md#backup) and save your encryption key somewhere safe.
- Read secrets from scripts and CI with the [REST API](api.md#secrets).
- Use the [proxy](api.md#proxy) to call APIs with keyhall injecting the key.
