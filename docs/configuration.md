# Configuration

keyhall is configured only through environment variables. Everything else (connections,
projects, tokens, secrets) lives in the database and is managed from the panel.

## Server variables

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | yes | | Signs panel sessions. Any long random string: `openssl rand -base64 32`. Changing it signs everyone out. |
| `KEYHALL_ENCRYPTION_KEY` | yes | | 32 bytes, base64 (`openssl rand -base64 32`). Encrypts every stored credential and secret. keyhall refuses to start without a valid one. See [Rotating the key](operations.md#rotating-the-encryption-key). |
| `BETTER_AUTH_URL` | yes | | Public URL of the panel, exactly as people type it, e.g. `https://keyhall.example.com`. Used for cookies and as the OAuth callback base. |
| `TRUSTED_ORIGINS` | yes | | Origins allowed to call the auth API, comma-separated. Usually the same value as `BETTER_AUTH_URL`. |
| `KEYHALL_ALLOW_STDIO` | no | `true` | `false` disables local (command) MCP connections. See [Security](security.md#local-connections). |
| `DATABASE_PATH` | no | `/data/keyhall.db` in the image, `../data/keyhall.db` from source | SQLite file. Its directory is created if missing. |
| `HOST` | no | `0.0.0.0` in the image, `127.0.0.1` from source | Address the HTTP server binds to. |
| `PORT` | no | `8787` | HTTP port. |

## Compose variables

The files in [`deploy/`](../deploy) read a `.env` file next to them
([`deploy/.env.example`](../deploy/.env.example)) and translate it into the variables above:

| Variable | Used by | Meaning |
|---|---|---|
| `KEYHALL_VERSION` | all | Image tag: `0.1.0` (exact release), `0.1` (latest patch of a minor line) or `latest`. |
| `KEYHALL_URL` | `deploy/`, `deploy/tailscale/` | Becomes `BETTER_AUTH_URL` and `TRUSTED_ORIGINS`. |
| `KEYHALL_DOMAIN` | `deploy/caddy/` | Domain Caddy gets a certificate for; the URL becomes `https://<domain>`. |
| `KEYHALL_BIND`, `KEYHALL_PORT` | `deploy/` | Host address and port to publish on. Default `127.0.0.1:8787`. |
| `TS_AUTHKEY`, `TS_HOSTNAME` | `deploy/tailscale/` | Tailscale auth key and machine name (default `keyhall`). |

## Panel preferences

Language (English or Portuguese) and theme (system, light, dark) are chosen per browser from
the account menu and are not server settings.
