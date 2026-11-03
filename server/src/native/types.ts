import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js"

// Text shown in the panel, in each of its languages.
export type Text = { en: string; pt: string }

// A value the admin types when connecting. Secret values never go back to the panel and may be
// vault references ({{secret:NAME}}); the others are shown again when editing.
export type NativeField = {
  name: string
  label: Text
  secret?: boolean
  placeholder?: string
  // The panel keeps every value in the vault as <client name>_<vault>, e.g. GOOGLE_CLIENT_ID,
  // so one client serves several connections.
  vault: string
}

// A group of tools the admin turns on or off per connection (e.g. Gmail in Google). Each
// requests only the OAuth scopes its tools need.
export type NativeFeature = { id: string; label: Text; hint: Text }

export type OAuth2Config = {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
  // Extra authorization parameters (Google: access_type=offline, prompt=consent).
  params?: Record<string, string>
  // Endpoint that returns the signed-in account; accountField names its property.
  accountUrl?: string
  accountField?: string
}

// What a tool gets: authenticated requests to the provider.
export type NativeContext = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  json: <T = unknown>(url: string, init?: RequestInit) => Promise<T>
}

export type NativeTool = {
  feature: string
  tool: Tool
  run: (ctx: NativeContext, args: Record<string, unknown>) => Promise<unknown>
}

// A provider whose tools keyhall implements itself, for services without a usable MCP server.
// It declares its fields, features, OAuth setup and tools; the core does the rest (storage,
// consent, token refresh, the panel form, scopes and the gateway).
export type NativePlugin = {
  id: string
  // Default client name in the vault (GOOGLE → GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).
  vaultName: string
  // Where the admin creates the OAuth client.
  consoleUrl: string
  fields: NativeField[]
  features: NativeFeature[]
  oauth: (values: Record<string, string>, features: string[]) => OAuth2Config
  tools: NativeTool[]
}

export type { CallToolResult }
