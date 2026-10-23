// Minimal local (stdio) MCP server used by the end-to-end tests.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import * as z from "zod"

const server = new McpServer({ name: "echo", version: "1.0.0" })
server.registerTool(
  "show_env",
  { description: "Returns the FOO environment variable" },
  async () => ({ content: [{ type: "text", text: `FOO=${process.env.FOO}` }] })
)
server.registerTool(
  "echo",
  { description: "Echoes the text back", inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: "text", text }] })
)
await server.connect(new StdioServerTransport())
