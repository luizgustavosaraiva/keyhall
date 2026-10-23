# Contributing to keyhall

Thanks for your interest! Bug reports, documentation fixes, translations and code are all
welcome. Please read this page before opening an issue or a pull request.

## Ground rules

- Be respectful. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security issues are never reported in public issues.** See [SECURITY.md](SECURITY.md).
- English for everything in the repository: code, comments, commit messages, issues, docs.
  The panel is translated in `web/src/locales`; other languages are welcome there.
- Search existing issues before opening a new one.
- For anything bigger than a small fix, **open an issue first** and wait for a go-ahead. It
  saves you from writing code that won't be merged.
- One change per pull request. Small PRs get reviewed faster.

## Licensing of contributions

keyhall is distributed under the [PolyForm Noncommercial License 1.0.0](LICENSE), and the
author also offers separate commercial licenses. To keep that possible, by submitting a
contribution you agree that:

1. you wrote it, or have the right to submit it, under the terms below
   ([Developer Certificate of Origin 1.1](https://developercertificate.org));
2. it is licensed to everyone under the project's license; and
3. you grant Luiz Gustavo Saraiva a perpetual, worldwide, non-exclusive, royalty-free,
   irrevocable license to use, modify, sublicense and distribute your contribution under any
   terms, including commercial ones.

Sign off every commit to confirm it (`git commit -s`), which adds a
`Signed-off-by: Your Name <you@example.com>` line.

## Development setup

Requirements: Node.js 24+, pnpm 12, Git.

```bash
git clone https://github.com/luizgustavosaraiva/keyhall.git
cd keyhall
pnpm install
cp .env.example .env     # fill BETTER_AUTH_SECRET and KEYHALL_ENCRYPTION_KEY (openssl rand -base64 32)
pnpm dev:server          # API on http://127.0.0.1:8787 (the setup code is in this output)
pnpm dev:web             # panel on http://localhost:5173, proxying /api to the server
```

Local data goes to `data/keyhall.db` (ignored by Git). Delete it to start over from the setup
screen.

Read [docs/architecture.md](docs/architecture.md) for a map of the code.

## Before you push

Run the same checks CI runs:

```bash
pnpm check        # Biome: lint + format (pnpm check:fix applies safe fixes)
pnpm typecheck    # TypeScript, server and web
pnpm build        # production build
pnpm test         # end-to-end tests against the built server (server/test)
```

The end-to-end tests start the real server on a temporary database and exercise setup,
sign-in, connections, scopes, tokens, the MCP endpoint, the proxy and secrets. New behavior
should come with a test there.

And please:

- Test your change by hand in the panel and, if it touches MCP, with a real client or `curl`.
- Keep the existing style: Biome formatting, no semicolons, small functions, comments only
  where the code can't say it.
- New panel text goes in **both** `web/src/locales/en.ts` and `pt.ts` (use English in `pt.ts`
  if you don't speak Portuguese; a maintainer will translate it).
- Schema changes: edit `server/src/db/app-schema.ts`, run `pnpm --filter server db:generate`
  and commit the migration. Never edit a released migration.
- Update the docs in `docs/` when behavior changes, and add a line to the `Unreleased`
  section of [CHANGELOG.md](CHANGELOG.md).
- Don't add dependencies without discussing them in the issue first.

## What happens when you open a pull request

Pull requests from forks run with a read-only token and no secrets. For a first-time
contributor, a maintainer approves the workflow run before it starts. Then these checks must
all pass before anything is merged:

| Check | Workflow | What it verifies |
|---|---|---|
| lint, types, build, tests | `ci` | Biome, TypeScript, production build, end-to-end tests, `pnpm audit` (high and critical) |
| docker image | `ci` | The image builds, starts, answers `/api/health` with the right version, runs as a non-root user, and has no fixable critical vulnerabilities (Grype) |
| codeql | `security` | Static analysis of the TypeScript code and of the GitHub workflows (`security-extended` queries) |
| leaked secrets | `security` | Gitleaks over the commits |
| dependency review | `security` | New dependencies have no known moderate+ vulnerabilities and use a permissive license |

After the checks, a maintainer reviews the code (see [CODEOWNERS](.github/CODEOWNERS)). The
review looks at:

- **security**: credentials never logged or returned; token reach enforced; input validated;
- **scope**: one change per PR, discussed in an issue first;
- **tests and docs**: behavior covered by a test, docs and changelog updated;
- **dependencies**: avoided unless clearly worth it.

`main` only takes changes through pull requests with these checks green. Workflow files
(`.github/`) changed by outside contributors get extra scrutiny.

## Commits and pull requests

- Commit messages: short imperative summary in English ("Add proxy timeout setting"), body
  explaining why when it isn't obvious, `Signed-off-by` line at the end.
- Fill in the pull request template. Link the issue (`Closes #123`).
- A maintainer reviews, may ask for changes, and merges with a squash.

## Releases (maintainers)

keyhall uses [Semantic Versioning](https://semver.org). To release:

1. Move the `Unreleased` entries in `CHANGELOG.md` under a new version heading with the date.
2. Set the same version in the root `package.json`.
3. Commit (`Release v0.2.0`), tag and push:

   ```bash
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin main v0.2.0
   ```

The `release` workflow checks that the tag matches `package.json`, builds and publishes the
multi-arch image to `ghcr.io/luizgustavosaraiva/keyhall` (`0.2.0`, `0.2`, `latest`), and creates
the GitHub release with that version's changelog section.
