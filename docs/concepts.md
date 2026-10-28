# Concepts

```
Organization
└── Project
    ├── Connections   (remote MCP · local MCP command · HTTP API)
    ├── Secrets
    └── Scopes        (hand-picked connections, tools and secrets)

Token  →  an organization, a project, or a scope
```

## Organization

The top-level boundary. Projects, connections, scopes, secrets and tokens of one organization
never mix with another's. Most people need just one; create more to keep, say, personal and
client work fully apart.

## Project

A group of connections and secrets inside an organization, e.g. `personal`, `acme-site`,
`infra`. Connection and secret names are unique per project, so two projects can each have a
`github` connection with different credentials.

## Connection

Something keyhall reaches on behalf of your consumers. Three kinds:

| Kind | What it is | Credential |
|---|---|---|
| **Remote MCP** | An MCP server over Streamable HTTP, e.g. `https://mcp.example.com/mcp`. | OAuth, done once in the browser from the panel; or fixed headers under **Advanced**, e.g. `Authorization: Bearer {{secret:KEY}}`, encrypted; or none. keyhall refreshes OAuth tokens. |
| **Local** | An MCP server started by a command (`npx -y some-mcp-server`), pasted as the `mcpServers` JSON that READMEs show for Claude Desktop or Cursor. | Environment variables, encrypted. |
| **HTTP API** | Any HTTP API with a fixed key. With an OpenAPI 3 spec, each operation becomes an MCP tool. | A header (e.g. `Authorization: Bearer …`), encrypted. |

A remote server's `mcpServers` snippet (`url` or `serverUrl` with `headers`) pasted in the
**Local** tab is recognized: the panel offers to create it as a remote MCP connection with
those headers. `${NAME}` and `${env:NAME}` in a header become `{{secret:NAME}}`, since the vault
plays the role the environment plays in those clients.

Every tool is exposed to consumers with the connection's name as a prefix:
`github__create_issue`. When a token reaches several projects, the project is added too:
`acme__github__create_issue`.

## Scope

A hand-picked selection inside a project (or across the organization): which connections, and
optionally which tools of each, and which secrets. Use one scope per consumer or per job, e.g.
"read-only Cloudflare DNS for the support bot".

New tools that an upstream server adds later appear automatically only when a connection is
included with "all tools"; a picked list stays as it is.

## Token

What a consumer uses: `Authorization: Bearer kh_…`. Each token points at one target:

| Target | Sees |
|---|---|
| Organization | Everything in it, including what you add later. |
| Project | Everything in that project, including what you add later. |
| Scope | Only the connections, tools and secrets picked in the scope. |

Create one token per consumer so you can revoke each independently. Tokens are shown once and
stored only as a hash. They can expire (30 days, 90 days, 1 year) or not.

Each token also has a **tool mode**, which can be changed at any time:

- **Code Mode** (the default for new tokens): the consumer sees two tools, `search` and
  `execute`. The agent searches for the tools it needs, then writes a short script that calls
  them, combines the results and returns only what it needs. The tool list stays the same size
  however many connections the token reaches, and intermediate results never enter the
  model's context.
- **Every tool**: each tool of each reachable connection is listed. Simple, and fine for a few
  connections, but every connection adds to the context of every conversation.

Both modes reach exactly the same tools: Code Mode changes how they are called, not what the
token may do. See [API](api.md#code-mode).

## Secret

A named value stored encrypted, with history, e.g. `STRIPE_KEY`. Three ways to use it, from the
safest:

1. **Referenced by a connection**: `{{secret:STRIPE_KEY}}` in an API key field or in a local
   server's `env`. The value never leaves keyhall.
2. **Read by scripts and CI through REST** with a token that reaches it.
3. **Read by agents through MCP**, only for secrets marked "Readable by agents". The value
   enters the model's context, so use this only when there's no alternative.

Every read (panel, REST or MCP) is logged in the secret's history. See [API](api.md#secrets).

## The endpoint

All consumers use the same URL, `https://<your-keyhall>/mcp`. The token decides what each one
sees.
