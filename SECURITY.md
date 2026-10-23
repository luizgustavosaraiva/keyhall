# Security policy

keyhall stores credentials, so security reports are taken seriously and handled first.

## Supported versions

Only the latest minor release line receives security fixes (for example, while `0.3.x` is
current, fixes land in a new `0.3.x`). Upgrade to the latest release before reporting.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request.**

Report it privately through GitHub:
[**Report a vulnerability**](https://github.com/luizgustavosaraiva/keyhall/security/advisories/new)
(Security tab → Advisories → Report a vulnerability). If you can't use GitHub, e-mail
[gustavo@cubo.company](mailto:gustavo@cubo.company) with "keyhall security" in the subject.

Please include:

- the affected version (`/api/health` shows it) and how keyhall is deployed;
- what an attacker can do, and what access they need beforehand;
- steps to reproduce or a proof of concept;
- any suggested fix.

## What to expect

- Acknowledgement within **3 business days**.
- An assessment and a plan within **10 business days**.
- A fix released as soon as practical, followed by a published advisory that credits you
  (unless you'd rather stay anonymous).

Please give us a reasonable time to release a fix before disclosing anything publicly.

## Scope

In scope: the keyhall server, panel, Docker image and deployment files in this repository.

Out of scope: vulnerabilities in upstream MCP servers or APIs you connect, in third-party
packages you run as local connections, and issues that require an already-compromised server
or administrator account. Read the [security model](docs/security.md) for what keyhall does and
does not protect against.
