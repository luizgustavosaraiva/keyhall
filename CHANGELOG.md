# Changelog

All notable changes to keyhall are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-23

First public release.

### Added

- **MCP gateway:** a single Streamable HTTP endpoint (`/mcp`) that aggregates the tools of every
  connection a token reaches, prefixed with the connection name.
- **Connections:**
  - remote MCP servers with OAuth (dynamic client registration, PKCE, refresh);
  - local MCP servers started by command, pasted as `mcpServers` JSON, with encrypted `env`;
  - HTTP APIs with a stored key; with an OpenAPI 3 spec, each operation becomes a tool.
- **HTTP proxy** (`/api/proxy/<project>/<connection>/…`) that injects the stored API key.
- **Organizations, projects and scopes**, with tokens that reach an organization, a project,
  or a scope with hand-picked connections and tools.
- **Secrets vault:**
  - envelope encryption with full version history;
  - `{{secret:NAME}}` references in connections;
  - REST access for scripts (`/api/secrets`, `?format=env`);
  - opt-in MCP tools for agents;
  - every read logged.
- **Panel** in English and Portuguese, with light and dark themes. It covers:
  - browsing tools and their parameters;
  - client configuration snippets;
  - changing the password.
- **First-run setup** protected by a one-time code printed in the server log; sign-up closed
  afterwards.
- **Maintenance scripts:**
  - consistent online backup;
  - password reset;
  - encryption key rotation.
- `KEYHALL_ALLOW_STDIO` to disable local connections.
- Docker image for `linux/amd64` and `linux/arm64` with a health check, plus deployment files:
  - default compose;
  - Caddy with automatic HTTPS;
  - Tailscale sidecar;
  - systemd unit.
- `/api/health` reports the running version.
- End-to-end test suite, and CI and security workflows for pull requests:
  - CodeQL;
  - Gitleaks;
  - dependency review;
  - Grype image scan;
  - OpenSSF Scorecard.
- Images published with SBOM and provenance attestations.

[Unreleased]: https://github.com/luizgustavosaraiva/keyhall/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/luizgustavosaraiva/keyhall/releases/tag/v0.1.0
