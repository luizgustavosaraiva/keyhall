# Security model

keyhall concentrates credentials, so it's worth knowing exactly what it protects and what it
doesn't. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## What is encrypted

| Data | How it's stored |
|---|---|
| OAuth tokens, client registrations and fixed headers of remote MCP connections | AES-256-GCM |
| Keys of HTTP API connections | AES-256-GCM |
| `env` of local (command) connections | AES-256-GCM |
| Secrets | Envelope encryption: each version has its own random data key (AES-256-GCM), and that key is encrypted with the master key |
| keyhall tokens (`kh_…`) | Hash only; shown once at creation |
| Passwords | Hash only (Better Auth's scrypt) |

Every encrypted value has its own random IV and an authentication tag, so tampering is detected.
The master key is `KEYHALL_ENCRYPTION_KEY`, which lives only in the environment, never in the
database. A copy of the database alone reveals no credential.

## What is not encrypted

Names, URLs, commands and command **arguments**, scope definitions, and audit data (who read
which secret, when). Don't put keys in a local connection's `args`: put them in `env`, or
reference a secret.

## Who can do what

- **The administrator** (panel account) can see and change everything, including revealing
  secrets. Sign-up is closed after the first account; there's no way to register from outside.
- **A token** reaches only its organization, project or scope. Within that reach, it can call
  tools, use the proxy for API connections, and read secrets through REST. Through MCP it reads
  only secrets marked "Readable by agents".
- **Upstream credentials never reach consumers.** A consumer sees tool names and results, not
  the OAuth token or API key keyhall used.

Tokens are rate-limited to 600 requests per minute each.

### Code Mode

A token in Code Mode runs agent-written JavaScript inside keyhall, so the code runs isolated:

- in QuickJS compiled to WebAssembly, with a fresh memory per run;
- with no network, file system, timers, `process`, `require` or `WebAssembly`;
- with a single way out, `call()`, which goes through the same scope checks as a direct tool call.

Each run is limited to 60 seconds, 100 calls and 128 MB, and at most 4 run at a time.

Code Mode doesn't widen what a token reaches, but it lets an agent chain tools in one step. A
token that reaches both a secret readable by agents and a tool that sends data out (mail, an
HTTP API) could pass one to the other without the model seeing it. That's possible in the
other mode too, one call at a time. Keep those apart with scopes.

### Signing in on a phone

The account menu's **Sign in on a phone** shows a QR code. Scanning it opens the panel on the
phone with a session of its own. The code:

- can only be created by a signed-in administrator;
- works once and expires after 60 seconds;
- is stored only as a SHA-256 hash.

Attempts are limited to 10 per minute. The same dialog lists every signed-in device, and each one
can be signed out on its own. The QR code carries a sign-in link, so show it only to your own
camera.

## Local connections

A local connection runs a command you configure (`npx -y package`) **inside the keyhall
container** (or on the host, from source) as the unprivileged `node` user. The child process
gets only a minimal environment (`PATH`, `HOME` and similar) plus the `env` you set, not
keyhall's own variables. But it can read the container's filesystem, including the database
file, and reach the network.

So treat adding a local connection like installing software on the server: use only packages
you trust, from their official source. If you don't need local connections, disable them with
`KEYHALL_ALLOW_STDIO=false`.

## Exposure

keyhall is designed to be safe on the internet (closed sign-up, setup code, hashed tokens, rate
limits). Still, the fewer places can reach it, the better. Prefer, in this order:

1. a private network (VPN, [Tailscale](deploy/tailscale.md));
2. a public HTTPS endpoint with a firewall allow-list;
3. a public HTTPS endpoint.

Never run it on the public internet without HTTPS.

## Keys and backups

- Lose `KEYHALL_ENCRYPTION_KEY` and every stored credential is gone. Keep a copy outside the
  server.
- Leak it together with a database copy and everything is exposed:
  [rotate it](operations.md#rotating-the-encryption-key) and rotate the upstream credentials.
- `BETTER_AUTH_SECRET` signs sessions. If it leaks, change it (everyone is signed out).
