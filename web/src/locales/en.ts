// Panel strings in English (the default). These keys define the type of pt.ts.
export const en = {
  "account.googleLinked": "Google account linked",
  "account.googleLink": "Sign in with Google too",
  "account.googleFailed": "Could not link the Google account.",
  "account.changePassword": "Change password",
  "account.language": "Language",
  "account.legal":
    "Based on keyhall by Luiz Gustavo Saraiva. Free software under the GNU AGPL 3.0, with no warranty.",
  "account.signOut": "Sign out",
  "account.source": "Source code and license",
  "account.theme": "Theme",

  "api.baseUrl": "Base URL",
  "api.editHint":
    "Leave the key blank to keep the current one. With a URL, saving downloads the spec again.",
  "api.header": "Key header",
  "api.key": "API key",
  "api.prefix": "Prefix",
  "api.prefixHint":
    'Goes before the key: "Bearer " for Authorization, empty when the header carries only the key.',
  "api.spec": "OpenAPI spec",
  "api.specChoose": "Choose a JSON file or drop it here",
  "api.specCurrent": "Uploaded file in use. Choose another to replace it.",
  "api.specFile": "File",
  "api.specFileHint":
    "An OpenAPI 3 JSON file. Upload a trimmed copy with only the routes you want: each operation becomes an MCP tool you can allow per scope.",
  "api.specHint":
    "Each operation becomes an MCP tool you can allow per scope. Without a spec, the API is only reachable through /api/proxy, as a whole.",
  "api.specInvalid": "This file is not an OpenAPI 3 spec in JSON.",
  "api.specOperations": "{n} operations",
  "api.specOperations_one": "1 operation",

  "authorize.approve": "Allow",
  "authorize.deny": "Deny",
  "authorize.description":
    "Choose what it reaches. It gets a token like the ones on the Tokens page, and goes back to {host}.",
  "authorize.loading": "Authorize access",
  "authorize.org": "Organization",
  "authorize.revokeHint":
    "The token shows on the Tokens page, where you can revoke it at any time.",
  "authorize.title": "Allow {client} into keyhall?",
  "auth.tagline":
    "One door to every MCP server, API and secret your agents use",

  "catalog.back": "Back",
  "catalog.connected": "{n} connected",
  "catalog.connected_one": "1 connected",
  "catalog.custom": "Custom",
  "catalog.customDescription": "Any MCP server, HTTP API or local command",
  "catalog.description":
    "Pick a service to connect in one click, or set up a custom connection.",
  "catalog.empty": "Nothing found. Use Custom to connect it by address.",
  "catalog.getKey": "Where to get the key",
  "catalog.oauthHint":
    "Creating the connection opens {name} to sign in and authorize keyhall.",
  "catalog.optionalKey": "{label} (optional)",
  "catalog.optionalKeyHint":
    "Leave it empty to sign in with your {name} account. A key is for accounts or setups without a browser sign-in.",
  "catalog.pending": "{n} pending",
  "catalog.pending_one": "1 pending",
  "catalog.search": "Search services",
  "common.cancel": "Cancel",
  "common.copied": "Copied",
  "common.copy": "Copy",
  "common.create": "Create",
  "common.delete": "Delete",
  "common.done": "Done",
  "common.email": "Email",
  "common.keepCurrent": "keep the current value",
  "common.loading": "Loading…",
  "common.more": "More actions",
  "common.name": "Name",
  "common.password": "Password",
  "common.rename": "Rename",
  "common.save": "Save",
  "common.working": "Working…",

  "connections.configure": "Configure",
  "connections.connect": "Connect",
  "connections.connected": "{name} connected",
  "connections.deleteDescription":
    "Consumers lose its tools right away. This can't be undone.",
  "connections.deleteInScopes":
    "It will be removed from these scopes: {scopes}. Their tokens lose its tools until you add it back. To renew an authorization, use Reconnect instead.",
  "connections.deleteTitle": "Delete {name}?",
  "connections.description":
    "MCP servers and APIs that keyhall reaches on behalf of your consumers. Credentials stay encrypted here.",
  "connections.emptyDescription":
    "Add a remote MCP server, an HTTP API with an OpenAPI spec, or a local MCP command.",
  "connections.emptyTitle": "No connections yet",
  "connections.move": "Move",
  "connections.moved": "{name} moved to {project}",
  "connections.moveDescription":
    "It leaves the scopes of its current project. Organization scopes keep it.",
  "connections.moveTarget": "Target project",
  "connections.moveTitle": "Move {name}",
  "connections.new": "New connection",
  "connections.newIn": "New connection in {project}",
  "connections.reconnect": "Reconnect",
  "connections.rename": "Rename connection",
  "connections.restart": "Restart",
  "connections.slugHint": "Tool prefix: {slug}__tool_name.",
  "connections.title": "Connections",
  "connections.tools": "Tools",
  "connections.type": "Connection type",
  "connections.updated": "{name} updated",
  "connections.url": "Server URL",

  "devices.description":
    "Scan the code with your phone's camera to sign in there. Each device gets a session of its own.",
  "devices.expired": "Code expired. Tap for a new one",
  "devices.expiresIn": "Valid for one use, for {n} more seconds",
  "devices.expiresIn_one": "Valid for one use, for 1 more second",
  "devices.failed": "Couldn't do that. Try again.",
  "devices.linkFailed":
    "This sign-in code is invalid or has expired. Generate a new one.",
  "devices.linked": "New device signed in",
  "devices.localhost":
    "This panel is open as localhost, which the phone can't reach. Open it by an address the phone can reach, then scan again.",
  "devices.menu": "Sign in on a phone",
  "devices.oneUse": "Each code works once and expires in a minute.",
  "devices.signOut": "Sign out this device",
  "devices.signedIn": "Signed-in devices",
  "devices.since": "Since {date}",
  "devices.thisDevice": "This device",
  "devices.title": "Sign in on a phone",

  "kind.api": "HTTP API",
  "kind.apiDescription":
    "An HTTP API with a fixed key. The key stays encrypted in keyhall and never reaches consumers.",
  "kind.mcp": "Remote MCP",
  "kind.mcpDescription":
    "A remote MCP server (Streamable HTTP), authorized with OAuth right after you create it, or with a key under Advanced.",
  "kind.native": "Native",
  "kind.nativeDescription":
    "Tools that keyhall implements itself, signed in with your own OAuth client.",
  "kind.stdio": "Local",
  "kind.stdioDescription":
    "A local MCP server (npx, node) that keyhall runs and proxies. Use only packages you trust: the process runs inside the keyhall server.",

  "login.or": "or",
  "login.googleFailed":
    "This Google account isn't linked to any keyhall user. Sign in with your password and link it from the account menu.",
  "login.google": "Continue with Google",
  "login.description": "Use your administrator account",
  "login.failed": "Could not sign in",
  "login.pending": "Signing in…",
  "login.submit": "Sign in",
  "login.title": "Sign in",

  "mcp.addHeader": "Add header",
  "mcp.advanced": "Advanced",
  "mcp.editHint":
    "Blank values keep the current one; removing a row deletes the header. Saving reconnects.",
  "mcp.headerName": "Header name",
  "mcp.headers": "Headers",
  "mcp.headersHint":
    "Sent on every request to the server and encrypted in keyhall. A fixed Authorization replaces OAuth, for servers that take a key.",
  "mcp.removeHeader": "Remove header",

  "native.badName":
    "The client name takes uppercase letters, numbers and _, starting with a letter.",
  "native.client": "OAuth client",
  "native.clientName": "Name in the vault",
  "native.clientNameHint":
    "The values are saved as secrets of this project with the suffixes {names}, and any other connection can use them.",
  "native.console": "Create the client in the console",
  "native.editHint": "Pick another saved client, or add a new one.",
  "native.guide": "Setup guide",
  "native.nameTaken": "There are already secrets named {name} in this project.",
  "native.newClient": "New client",
  "native.newHint":
    "Create an OAuth client (Web application) at the provider and paste its ID and secret here.",
  "native.reauth": "Changing the client asks for sign-in again.",
  "native.redirect": "Redirect URI",
  "native.redirectHint":
    "Add it to the authorized redirect URIs of your OAuth client (Web application).",
  "native.savedClient": "Saved client",
  "native.savedHint": "The same client can serve several connections.",
  "native.usedBy": "{name} · used by {by}",
  "nav.connections": "Connections",
  "nav.manage": "Manage",
  "nav.menu": "Open menu",
  "nav.scopes": "Scopes",
  "nav.tokens": "Tokens",

  "oauth.expired": "Authorization invalid or expired; try again",
  "oauth.failed": "Could not authorize {name}",
  "oauth.ok": "{name} connected",

  "org.delete": "Delete organization",
  "org.deleteDescription":
    "Only empty organizations can be deleted: remove its projects and scopes first.",
  "org.deleteTitle": "Delete {name}?",
  "org.label": "Organization",
  "org.new": "New organization",
  "org.newDescription":
    "Organizations keep projects, connections, scopes and tokens fully apart.",
  "org.plural": "Organizations",
  "org.rename": "Rename organization",
  "org.slugHint": "Used in URLs and identifiers; it doesn't change later.",
  "org.switch": "Switch organization",

  "password.changed": "Password changed. Other sessions were signed out.",
  "password.confirm": "Confirm new password",
  "password.current": "Current password",
  "password.description":
    "At least 8 characters. Other browsers signed in to this account will be signed out.",
  "password.failed": "Could not change the password",
  "password.mismatch": "The new passwords don't match",
  "password.new": "New password",
  "password.submit": "Change password",

  "project.all": "All projects",
  "project.deleteDescription":
    "Only empty projects can be deleted: move or delete its connections and scopes first.",
  "project.deleteTitle": "Delete {name}?",
  "project.label": "Project",
  "project.new": "New project",
  "project.newDescription":
    "Connections, scopes and tokens are kept apart per project.",
  "project.newIn": "New project in {org}",
  "project.plural": "Projects",
  "project.rename": "Rename project",
  "project.slugHint":
    "Shows up in tool names for organization tokens: {slug}__stripe__…",

  "rename.description":
    "Only the display name changes; the identifier stays, so tool names and tokens keep working.",

  "scopes.allTools": "All tools",
  "scopes.allToolsHint": "Including tools this connection gains later",
  "scopes.chipAll": "all tools",
  "scopes.chipCount": "{n} tools",
  "scopes.chipCount_one": "1 tool",
  "scopes.clear": "Clear",
  "scopes.connections": "Connections",
  "scopes.createConnectionFirst": "Create a connection first.",
  "scopes.deleteDescription": "Tokens of this scope stop working right away.",
  "scopes.deleteTitle": "Delete {name}?",
  "scopes.descriptionOrg":
    "Organization scopes can mix connections from different projects; the project becomes part of the tool names.",
  "scopes.descriptionProject":
    "A scope is a hand-picked set of connections and tools from {project}. Each token sees only its scope.",
  "scopes.edit": "Edit tools",
  "scopes.editorDescription":
    "Consumers of this scope only see the connections and tools you select.",
  "scopes.emptyDescription":
    "Create a scope to give a consumer only the tools it needs.",
  "scopes.emptyTitle": "No scopes yet",
  "scopes.include": "Include connection",
  "scopes.levelOrg": "Organization-wide",
  "scopes.levelProject": "Project {project}",
  "scopes.new": "New scope",
  "scopes.noConnections": "No connections",
  "scopes.noneSelected":
    "None selected: this scope won't see any tool from this connection.",
  "scopes.notIncluded": "Not included",
  "scopes.notIncludedHint": "{name} isn't included yet.",
  "scopes.pickConnection": "Pick a connection on the left to choose its tools.",
  "scopes.rename": "Rename scope",
  "scopes.selectAll": "Select all",
  "scopes.selectedOf": "{n} of {total} selected",
  "scopes.slugHintOrg": "Organization scope in {org}.",
  "scopes.slugHintProject": "Scope of project {project}.",
  "scopes.summary": "{n} connections in this scope",
  "scopes.summary_one": "1 connection in this scope",
  "scopes.title": "Scopes",

  "setup.code": "Setup code",
  "setup.codeHint":
    "Printed in the server log on startup (docker logs keyhall).",
  "setup.description":
    "Create the administrator account. It's the first and only account sign-up accepts.",
  "setup.name": "Your name",
  "setup.signInFailed": "Account created, but signing in failed",
  "setup.submit": "Create account",
  "setup.title": "Set up keyhall",

  "slug.label": "Identifier",
  "slug.placeholder": "generated from the name",
  "slug.taken": "This identifier is already in use.",

  "status.connected": "Connected",
  "status.error": "Error",
  "status.pending": "Pending",

  "stdio.config": "Configuration (JSON)",
  "stdio.editHint":
    "Blank variables keep their current value; removing one from the JSON deletes it. Saving restarts the process.",
  "stdio.envHint":
    "Variables are encrypted in keyhall and only the server process receives them.",
  "stdio.hint":
    "Paste the mcpServers snippet the server's docs show for Claude Code, Claude Desktop or Cursor.",
  "stdio.isRemote": "This JSON describes a remote server.",
  "stdio.runs": "keyhall runs: {command}",
  "stdio.secretInArgs":
    'An argument looks like a key. Arguments are stored unencrypted and shown in the panel; pass the key through a variable in "env".',
  "stdio.useRemote": "Use as remote MCP",

  "theme.dark": "Dark",
  "theme.light": "Light",
  "theme.system": "System",

  "tokens.access": "Access",
  "tokens.broadWarning":
    "Full access, including connections and tools added later. Prefer an expiry date.",
  "tokens.copyNow": "Copy it now: keyhall won't show this token again.",
  "tokens.create": "Create token",
  "tokens.created": "Token created",
  "tokens.createScopeFirst": "Create a scope first.",
  "tokens.days": "{n} days",
  "tokens.description":
    "One token per consumer (Claude Code, a bot…). It covers the organization, a project or a scope.",
  "tokens.emptyDescription":
    "Create a token and paste it into your MCP client together with the endpoint.",
  "tokens.emptyTitle": "No tokens yet",
  "tokens.endpoint": "MCP endpoint",
  "tokens.endpointHint": "Every consumer uses this URL with its own token.",
  "tokens.expires": "Expires",
  "tokens.expiry": "Expiry",
  "tokens.lastUsed": "Last used",
  "tokens.mode": "Tools",
  "tokens.modeChanged":
    "Mode changed. Clients see it the next time they list tools.",
  "tokens.modeCode": "Code Mode",
  "tokens.modeCodeHint":
    "Two tools, search and execute: the agent finds what it needs and calls it from code. The context stays small however many connections the token reaches.",
  "tokens.modeTools": "Every tool",
  "tokens.modeToolsHint":
    "Each tool is listed to the client. Simple, but every connection adds to the context.",
  "tokens.toCode": "Switch to Code Mode",
  "tokens.toTools": "List every tool",
  "tokens.levelOrg": "Organization",
  "tokens.levelOrgHint": "Everything in {name}.",
  "tokens.levelProject": "Project",
  "tokens.levelProjectHint": "Everything in one project.",
  "tokens.levelScope": "Scope",
  "tokens.levelScopeHint": "Only the connections and tools of one scope.",
  "tokens.never": "Never",
  "tokens.new": "New token",
  "tokens.newDescription":
    "One token per consumer, so you can revoke each one.",
  "tokens.revoke": "Revoke",
  "tokens.revokeDescription":
    "Consumers using this token lose access right away.",
  "tokens.revokeTitle": "Revoke {name}?",
  "tokens.scope": "Scope",
  "tokens.targetOrg": "Organization {name}",
  "tokens.targetOtherOrg": "Another organization",
  "tokens.targetProject": "Project {name}",
  "tokens.targetRemoved": "Removed scope",
  "tokens.targetScope": "Scope {name}",
  "tokens.title": "Tokens",
  "tokens.useIt": "Use it",
  "tokens.year": "1 year",

  "tools.count": "{n} tools",
  "tools.count_one": "1 tool",
  "tools.none": "No tools match your search.",
  "tools.of": "Tools of {name}",
  "tools.search": "Search tools",
  "nav.secrets": "Secrets",
  "scopes.secretAgents": "Readable by agents (MCP) and REST",
  "scopes.secretCount": "{n} secrets",
  "scopes.secretCount_one": "1 secret",
  "scopes.secretRest": "Readable through REST",
  "scopes.secrets": "Secrets",
  "vault.agents": "Readable by agents (MCP)",
  "vault.agentsHint":
    "Adds keyhall__get_secret to the MCP tools of tokens that reach this secret",
  "vault.agentsPill": "Agents",
  "vault.agentsWarning":
    "The value goes into the model's context and through its provider, and may show up in logs or replies. Prefer referencing the secret from a connection, so it never leaves keyhall.",
  "vault.clearRef": "Type a value instead",
  "vault.current": "current",
  "vault.deleteDescription":
    "Its versions and read history are deleted too. Tokens that read it get a not-found error.",
  "vault.deleteTitle": "Delete {name}?",
  "vault.description":
    "Keys, passwords and certificates kept encrypted in keyhall. Connections reference them, scripts read them through REST, and agents only when you allow it.",
  "vault.descriptionLabel": "Description",
  "vault.descriptionPlaceholder": "What it's for, who owns it",
  "vault.detailsDescription":
    "The value doesn't change here; use New value for that.",
  "vault.editDetails": "Edit details",
  "vault.emptyDescription":
    "Store a key once and reference it from connections, scripts and agents.",
  "vault.emptyTitle": "No secrets yet",
  "vault.hide": "Hide",
  "vault.history": "History",
  "vault.historyDescription":
    "Every version and every read, from the panel, REST or MCP.",
  "vault.keyHint": "type a value or pick a secret",
  "vault.nameHint":
    "Reference it as {{secret:{name}}}; in env format it becomes {name}=…",
  "vault.nameTaken": "A secret with this name already exists in this project.",
  "vault.new": "New secret",
  "vault.newDescription":
    "The value is encrypted with its own key, protected by the server's master key.",
  "vault.newValue": "New value",
  "vault.noDescription": "No description",
  "vault.noneYet": "No secrets in this organization yet",
  "vault.noReads": "Nobody has read this secret yet.",
  "vault.otherProjects": "Other projects",
  "vault.reads": "Reads",
  "vault.reveal": "Reveal",
  "vault.rotate": "New value",
  "vault.rotated": "{name} updated",
  "vault.rotateDescription":
    "Saving creates version {version}. Connections that reference it use the new value right away; earlier versions stay in the history.",
  "vault.save": "Save secret",
  "vault.show": "Show",
  "vault.title": "Secrets",
  "vault.usageDescription":
    "A token reads the secrets of its organization, its project, or the ones picked in its scope.",
  "vault.usageEnv": "All as env",
  "vault.usageMcp":
    'Agents see two tools, keyhall__list_secrets and keyhall__get_secret, only for secrets marked "Readable by agents" and within their token\'s reach. Every read is logged.',
  "vault.usageOne": "One secret",
  "vault.usageRefs":
    "In connections, use the vault button in the key fields, or type {{secret:NAME}} ({{secret:project/NAME}} for another project).",
  "vault.usageTitle": "Reading secrets",
  "vault.usedBy": "used by {n} connections",
  "vault.usedBy_one": "used by 1 connection",
  "vault.useSecret": "Use a secret",
  "vault.value": "Value",
  "vault.versions": "Versions",
  "vault.viaPanel": "Panel",
  "connections.connecting": "Connecting {name}…",
  "connections.connectingShort": "Connecting…",
  "connections.redirecting": "Opening the {name} authorization page…",
  "connections.restarting": "Restarting {name}…",
  "connections.restartingShort": "Restarting…",
  "tools.loadingFrom": "Loading tools from {name}…",
  "tools.loadingHint":
    "Asking the server for its tools. Large servers can take a few seconds.",
  "tools.matching": "{n} of {total} tools",
  "tools.noDescription": "This tool has no description.",
  "tools.noParams": "No parameters.",
  "tools.params": "Parameters",
  "tools.required": "required",
  "invite.create": "Create account and join",
  "invite.description":
    "You were invited as {email}. Create your account to see what was shared with you.",
  "invite.googleHint": "Use the Google account of {email}.",
  "invite.invalid":
    "This invitation is invalid, expired or already used. Ask for a new link.",
  "invite.join": "Accept the invitation",
  "invite.leave": "Continue without it",
  "invite.loading": "Opening the invitation…",
  "invite.passwordHint": "At least 8 characters.",
  "invite.title": "Invitation to {org}",
  "invite.wrongAccount":
    "You are signed in as {current}, but this invitation is for {email}. Sign out and open the link again.",
  "member.access": "Your access",
  "member.accessDescription":
    "What {org} shared with you. Use it with a token or by signing in from an MCP client; the admin decides what's here and can change it at any time.",
  "member.accessTitle": "Your access",
  "member.allTools": "All tools",
  "member.emptyDescription":
    "Ask the organization's admin to grant you connections, scopes or secrets.",
  "member.emptyTitle": "Nothing shared with you yet",
  "member.nav": "Your space",
  "member.noneDescription": "You are not a member of any organization anymore.",
  "member.noneTitle": "No organization",
  "member.role": "Member",
  "member.scopesHint":
    "Ready-made sets of connections and tools. A token for a scope reaches only it.",
  "nav.team": "Team",
  "team.access": "Access",
  "team.accessDescription":
    "Pick what this person may use: connections (all tools or only some), secrets and scopes. Changes apply on their next call.",
  "team.accessHint":
    "Members use what is granted here but never see addresses, headers or credentials, and can't edit anything.",
  "team.accessTitle": "Access for {name}",
  "team.active": "Active",
  "team.countConnections": "{n} connections",
  "team.countConnections_one": "1 connection",
  "team.countScopes": "{n} scopes",
  "team.countScopes_one": "1 scope",
  "team.countSecrets": "{n} secrets",
  "team.countSecrets_one": "1 secret",
  "team.createLink": "Create invitation link",
  "team.description":
    "People invited to {org}. Each one signs in to keyhall and uses only what you grant them, with their own tokens.",
  "team.email": "E-mail",
  "team.emptyDescription":
    "Invite someone by link, then pick which connections, tools, scopes and secrets they may use.",
  "team.emptyTitle": "No one invited yet",
  "team.expired": "Invitation expired",
  "team.invite": "Invite",
  "team.invited": "Invited",
  "team.inviteDescription":
    "keyhall makes a link for you to send. The person signs in with a password or Google, using this e-mail.",
  "team.invitedUntil": "Link valid until {date}",
  "team.inviteTitle": "Invite to {org}",
  "team.linkDescription":
    "Send this link to the person. It works once, for 7 days, and only shows now; you can make a new one from the member's menu.",
  "team.linkTitle": "Invitation link",
  "team.newLink": "New invitation link",
  "team.remove": "Remove",
  "team.removeDescription":
    "Their tokens stop working at once. If they belong to no other organization, their account is deleted too.",
  "team.removeTitle": "Remove {name}?",
  "team.saved": "Access saved",
  "team.scopeHint": "Scope · {n} connections",
  "team.scopeHint_one": "Scope · 1 connection",
  "team.scopes": "Scopes",
  "team.title": "Team",
  "tokens.levelMember": "My access",
  "tokens.levelMemberHint":
    "Everything shared with you in this organization, as it changes.",
  "tokens.targetMember": "My access",
  "approvals.approve": "Approve",
  "approvals.approved": "Approved",
  "approvals.deny": "Deny",
  "approvals.denied": "Denied",
  "approvals.description":
    "Calls to tools that need approval. The agent waits {wait} s; after that, an approval holds for the same call for {valid} min, once.",
  "approvals.emptyDescription":
    "Pick which tools need approval in a connection's menu, under Approval.",
  "approvals.emptyTitle": "Nothing waiting",
  "approvals.history": "Latest decisions",
  "approvals.rulesCount": "{n} tools need approval",
  "approvals.rulesCount_one": "1 tool needs approval",
  "approvals.rulesDescription":
    "Each call to a checked tool waits for an admin, whatever the token or member. Use it for what can't be undone or talks to the world: sending, deleting, paying, publishing.",
  "approvals.rulesMenu": "Approval",
  "approvals.rulesNone": "No tool needs approval.",
  "approvals.rulesSaved": "Approval rules saved",
  "approvals.rulesTitle": "Approval for {name}",
  "approvals.status.approved": "Approved, not used yet",
  "approvals.status.denied": "Denied",
  "approvals.status.expired": "Expired",
  "approvals.status.pending": "Waiting",
  "approvals.status.used": "Approved",
  "approvals.title": "Approvals",
  "approvals.when": "Asked {at} · valid until {until}",
  "approvals.who": "Token {token} ({person}) · {connection} in {project}",
  "nav.approvals": "Approvals",
  "approvals.settings": "Timing",
  "approvals.settingsSaved": "Timing saved",
  "approvals.settingsDescription":
    "For every tool that needs approval, in all organizations.",
  "approvals.wait": "Wait (seconds)",
  "approvals.waitHint":
    "How long the agent's call waits for a decision before being told to repeat it. 0 answers at once; up to {max}, under the usual 60 s client timeout.",
  "approvals.valid": "Approval valid for (minutes)",
  "approvals.validHint":
    "How long an approval holds for the agent to repeat the call, once. Up to {max} (24 hours).",
  "common.edit": "Edit",
  "common.optional": "optional",
  "notify.add": "Add channel",
  "notify.button": "Notifications",
  "notify.title": "Notifications",
  "notify.description":
    "Where keyhall tells you a call is waiting for approval, with a link to approve it here. Every enabled channel gets each new request.",
  "notify.empty":
    "No channels yet. Add Telegram, ntfy, Discord, Slack or a webhook.",
  "notify.enabled": "Enabled",
  "notify.lastSent": "last sent {at}",
  "notify.neverSent": "not sent yet",
  "notify.lastError": "failed: {error}",
  "notify.withArgs": "With arguments",
  "notify.test": "Send a test",
  "notify.testSent": "Test sent to {name}",
  "notify.testFailed": "The test failed: {error}",
  "notify.deleteTitle": "Delete {name}?",
  "notify.deleteDescription":
    "keyhall stops notifying this channel. Its stored token or URL is deleted.",
  "notify.kind": "Service",
  "notify.namePlaceholder": "My phone",
  "notify.keep": "Saved; leave empty to keep it",
  "notify.includeArgs": "Include the call's arguments",
  "notify.includeArgsHint":
    "Helps you decide from your phone, but the arguments (e-mail text, IDs, amounts) leave keyhall for that service. Off by default.",
  "notify.kind.telegram": "Telegram",
  "notify.kind.ntfy": "ntfy",
  "notify.kind.discord": "Discord",
  "notify.kind.slack": "Slack",
  "notify.kind.webhook": "Webhook",
  "notify.field.botToken": "Bot token",
  "notify.field.chatId": "Chat ID",
  "notify.field.url": "URL",
  "notify.field.token": "Access token",
  "notify.field.webhookUrl": "Webhook URL",
  "notify.field.secret": "Signing secret",
  "notify.help.telegram":
    "Create a bot with @BotFather and paste its token. For the chat ID, send your bot a message, open api.telegram.org/bot<token>/getUpdates and copy chat.id (a group's starts with -).",
  "notify.help.ntfy":
    "The topic's URL, on ntfy.sh or your own server, then subscribe to the same topic in the ntfy app. Pick a hard-to-guess topic, or use an access token on your server.",
  "notify.help.discord":
    "In the Discord channel: Edit channel → Integrations → Webhooks → New webhook → Copy webhook URL.",
  "notify.help.slack":
    "Create an incoming webhook for the channel (api.slack.com/messaging/webhooks) and paste its URL.",
  "notify.help.webhook":
    "keyhall POSTs JSON (event approval.requested) to this URL. With a secret, the body is signed with HMAC-SHA256 in the X-Keyhall-Signature header.",
} as const
