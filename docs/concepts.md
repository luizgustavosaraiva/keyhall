# Concepts

```
Organization
└── Project
    ├── Connections   (remote MCP · local MCP command · HTTP API)
    ├── Secrets
    └── Scopes        (hand-picked connections, tools and secrets)

Token  →  an organization, a project, or a scope
Member →  connections (and tools), scopes and secrets granted by an admin
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

Something keyhall reaches on behalf of your consumers. Four kinds:

| Kind | What it is | Credential |
|---|---|---|
| **Remote MCP** | An MCP server over Streamable HTTP, e.g. `https://mcp.example.com/mcp`. | OAuth, done once in the browser from the panel; or fixed headers under **Advanced**, e.g. `Authorization: Bearer {{secret:KEY}}`, encrypted; or none. keyhall refreshes OAuth tokens. |
| **Local** | An MCP server started by a command (`npx -y some-mcp-server`), pasted as the `mcpServers` JSON that READMEs show for Claude Desktop or Cursor. | Environment variables, encrypted. |
| **HTTP API** | Any HTTP API with a fixed key. With an OpenAPI 3 spec, each operation becomes an MCP tool. | A header (e.g. `Authorization: Bearer …`), encrypted. |
| **Native** | Tools that keyhall implements itself, for services without a usable MCP server. Today: Gmail, Drive, Sheets and Calendar ([Google](google.md)). | Your own OAuth client (ID and secret, encrypted), and a sign-in done once from the panel. keyhall refreshes the tokens. |

### Catalog

**New connection** opens a catalog of well-known services: Notion, Linear, Atlassian,
Cloudflare, Sentry, Stripe, Gmail and others. Picking one fills in its address or command, and
the form asks only for what that service needs:

- nothing, for servers that sign in with OAuth;
- a key, for servers that take one;
- an OAuth client, for native plugins.

The result is an ordinary connection of one of the kinds above. **Custom** opens the full form,
for anything else. The catalog lives in `server/src/catalog.ts`. Each entry's icon is the
vendor's own: keyhall downloads it once and serves it to the panel.

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
| My access | A member's token: everything granted to that member, as the grants change. |

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

## Team

An admin invites people to an organization from **Team**. keyhall makes an invitation link
(valid 7 days, works once) for you to send; the person opens it and creates an account with a
password, or with Google when [Google sign-in](configuration.md) is on. Someone who already has
an account (a member of another organization) signs in and accepts.

Then pick what each member may use, at any granularity:

- **connections**, with all their tools or only some;
- **scopes**, as you built them;
- **secrets**.

Members sign in to the same panel and see only that, by name: never addresses, headers or
credentials, and they can't edit anything. They create their own tokens, for everything granted
to them (**My access**) or for one granted scope, and can approve MCP clients by
[OAuth](api.md#signing-in-by-oauth) the same way. Grants are checked on every call, so taking one
away takes effect at once. Removing a member ends their tokens; if they belong to no other
organization, their account is deleted.

Admins (the account made at first run, or with `admin:create`) reach everything and are never
members. How people reach the panel is up to your deployment: on a private network, invited
people need access to it too.

## Approval

Some tools shouldn't run without a person saying yes: sending an e-mail, deleting, paying,
publishing. In a connection's menu, **Approval** picks which of its tools wait for an admin on
each call, whatever the token or member. Their description tells agents so up front.

When an agent calls one, the request shows up on **Approvals** with the token, its owner, the
tool and the arguments. The call waits a little (45 seconds by default):

- approved in that time, it runs and returns as usual;
- denied, the agent gets an error saying so;
- no decision yet, the agent is told to repeat the same call once it's approved. The approval
  then holds for that exact call (same token, tool and arguments) for 15 minutes by default,
  and is used once.

Both times are set on **Approvals → Timing**: the wait from 0 to 55 seconds (0 answers at once;
keep it under your MCP clients' timeout, often 60 s, which is also Code Mode's run limit), and
the approval from 1 minute to 24 hours.

So an admin watching approves in place, and an unattended run never hangs: it stops with a
clear "waiting for approval". Only admins decide; members can't approve their own calls.

### Notifications

**Approvals → Notifications** adds the channels that tell you a call is waiting: Telegram (a bot
token and a chat ID), ntfy (a topic URL, optionally with an access token), Discord or Slack (an
incoming webhook URL), or any webhook. Every enabled channel gets each new request, with a link
to the Approvals page. **Send a test** checks a channel right away; a failed send shows on the
channel.

The call's arguments go out only on channels where you turn on **Include the call's arguments**,
since they then leave keyhall for that service. A webhook receives JSON:

```json
{
  "event": "approval.requested",
  "approval": {
    "id": "…",
    "tool": "send_message",
    "name": "gmail__send_message",
    "connection": "Gmail",
    "token": "Sales agent",
    "requestedBy": "ana@example.com",
    "expiresAt": "2026-11-17T18:00:00.000Z"
  },
  "url": "https://keyhall.example.com/#approvals"
}
```

With a signing secret, the `X-Keyhall-Signature` header carries `sha256=` and the HMAC-SHA256 of
the raw body. Channel fields are encrypted like connection credentials, and secret ones never go
back to the panel.

