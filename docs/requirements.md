# Requirements

keyhall is one Node.js process and one SQLite file. It runs anywhere Docker or Node runs: a
laptop, a home server, a Raspberry Pi, or the smallest VPS of any provider.

## Hardware

| | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 1–2 vCPU |
| Memory | 512 MB | 1 GB or more if you run several local (command) MCP servers |
| Disk | 1 GB free (image ≈ 520 MB, database usually a few MB) | 5 GB, to keep backups and old images |
| Architecture | `linux/amd64` or `linux/arm64` | |

For reference, a production instance with 8 connections (remote MCP servers, HTTP APIs and
local MCP servers started with `npx`) uses about 190 MB of RAM and well under 1% of one CPU
when idle.

What makes memory grow is **local (command) connections**: each one is a separate process that
stays alive inside the container, typically 50–150 MB each. Remote MCP servers and HTTP APIs
cost almost nothing.

## Software

**With Docker** (recommended):

- Docker Engine 24 or newer, with the Compose plugin (`docker compose`). Docker Desktop works
  on macOS and Windows.
- Nothing else: the image already has Node.js, `npx` and everything keyhall needs.

**Without Docker** (from source):

- Node.js 24 or newer.
- pnpm 12 (`npm install -g pnpm@12`).
- A C/C++ toolchain only if no prebuilt `better-sqlite3` binary exists for your platform
  (`python3`, `make`, `g++` on Debian/Ubuntu).

## Network

- **Outbound:** HTTPS to the services you connect (MCP servers, APIs, OAuth providers) and to
  the npm registry if you use `npx` local servers.
- **Inbound:** whatever your consumers use to reach keyhall. keyhall itself listens on one HTTP
  port (8787 by default).
- **HTTPS:** required by most OAuth providers for the callback, unless you only use keyhall on
  `localhost`. Use any reverse proxy (Caddy, nginx, Traefik), a platform that terminates TLS for
  you, or the optional [Tailscale guide](deploy/tailscale.md).

## Clients

Any MCP client that speaks **Streamable HTTP** and lets you set an `Authorization` header, such
as Claude Code, Cursor, VS Code or agents built on the MCP SDKs. Clients limited to local
(stdio) servers can go through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) with
`--header`. Scripts only need `curl`.
