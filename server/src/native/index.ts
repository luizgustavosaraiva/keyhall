import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js"
import type { connection } from "../db/schema.js"
import { google } from "./google.js"
import { nativeContext, nativeFeatures } from "./oauth2.js"
import type { NativePlugin } from "./types.js"

type Connection = typeof connection.$inferSelect

// Native plugins: providers whose tools keyhall implements itself. Adding one is a module that
// exports a NativePlugin, listed here, plus its catalog entries.
export const plugins: Record<string, NativePlugin> = { google }

export function pluginOf(conn: Connection): NativePlugin {
  const id = conn.config?.native
  const plugin = id ? plugins[id] : undefined
  if (!plugin) throw new Error(`unknown native plugin: ${id}`)
  return plugin
}

// Tools of the features chosen on the connection.
function toolsOf(conn: Connection) {
  const plugin = pluginOf(conn)
  const on = new Set(nativeFeatures(conn, plugin))
  return { plugin, tools: plugin.tools.filter((t) => on.has(t.feature)) }
}

export const nativeTools = (conn: Connection): Tool[] =>
  toolsOf(conn).tools.map((t) => t.tool)

export async function callNativeTool(
  conn: Connection,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  const { plugin, tools } = toolsOf(conn)
  const def = tools.find((t) => t.tool.name === name)
  if (!def)
    return {
      isError: true,
      content: [{ type: "text", text: `Tool not allowed: ${name}` }],
    }
  try {
    const result = await def.run(nativeContext(conn, plugin), args ?? {})
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }
}
