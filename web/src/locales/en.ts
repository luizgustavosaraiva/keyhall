// Panel strings in English (the default). These keys define the type of pt.ts.
export const en = {
  "account.changePassword": "Change password",
  "account.language": "Language",
  "account.signOut": "Sign out",
  "account.theme": "Theme",

  "api.baseUrl": "Base URL",
  "api.editHint":
    "Leave the key blank to keep the current one. Saving downloads the spec again.",
  "api.header": "Key header",
  "api.key": "API key",
  "api.prefix": "Prefix",
  "api.prefixHint":
    'Goes before the key: "Bearer " for Authorization, empty when the header carries only the key.',
  "api.spec": "OpenAPI spec (URL)",
  "api.specHint":
    "Each operation becomes an MCP tool you can allow per scope. Without a spec, the API is only reachable through /api/proxy, as a whole.",

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
    "A remote MCP server (Streamable HTTP), authorized with OAuth right after you create it.",
  "kind.stdio": "Local",
  "kind.stdioDescription":
    "A local MCP server (npx, node) that keyhall runs and proxies. Use only packages you trust: the process runs inside the keyhall server.",

  "login.description": "Sign in with your administrator account.",
  "login.failed": "Could not sign in",
  "login.pending": "Signing in…",
  "login.submit": "Sign in",
  "login.title": "Welcome back",

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
  "scopes.notIncludedHint": "{name} isn't part of this scope yet.",
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
  "setup.title": "Welcome to keyhall",

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
  "stdio.runs": "keyhall runs: {command}",
  "stdio.secretInArgs":
    'An argument looks like a key. Arguments are stored unencrypted and shown in the panel; pass the key through a variable in "env".',

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
} as const
