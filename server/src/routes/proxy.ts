import { Hono } from "hono"
import type { Access } from "../access.js"
import {
  authHeaders,
  matchOperation,
  operations,
  upstreamUrl,
} from "../api/openapi.js"
import { allowed } from "../mcp/gateway.js"

// Forwards HTTP calls to an API connection, injecting the key stored in keyhall.
// The token was verified in index.ts and decides which connections it reaches.
// /api/proxy/<project>/<connection>/<API path>
export const proxy = new Hono<{ Variables: { access: Access } }>().all(
  "/:project/:conn/*",
  async (c) => {
    const { project: projectSlug, conn: connSlug } = c.req.param()
    const link = c
      .get("access")
      .links.find(
        (l) =>
          l.project.slug === projectSlug &&
          l.conn.slug === connSlug &&
          l.conn.kind === "api"
      )
    if (!link)
      return c.json({ error: "API connection out of this token's reach" }, 404)

    const prefix = `/api/proxy/${projectSlug}/${connSlug}`
    const path = c.req.path.slice(prefix.length) || "/"
    const method = c.req.method

    // With a spec, only its operations pass, and only those allowed for the token.
    const ops = operations(link.conn)
    if (ops.length) {
      const op = matchOperation(ops, method, path)
      if (!op)
        return c.json(
          { error: `operation not in the spec: ${method} ${path}` },
          403
        )
      if (!allowed(link.allowedTools, op.name))
        return c.json({ error: `operation not allowed: ${op.name}` }, 403)
    } else if (link.allowedTools !== null) {
      return c.json(
        {
          error: "without a spec, the connection must be allowed in full",
        },
        403
      )
    }

    let url: URL
    try {
      url = upstreamUrl(link.conn, path, new URL(c.req.url).search)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
    const headers = authHeaders(link.conn)
    for (const name of ["content-type", "accept"]) {
      const value = c.req.header(name)
      if (value) headers.set(name, value)
    }
    const res = await fetch(url, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method)
        ? undefined
        : await c.req.arrayBuffer(),
      signal: AbortSignal.timeout(30_000),
    })
    const out = new Headers()
    const type = res.headers.get("content-type")
    if (type) out.set("content-type", type)
    return new Response(res.body, { status: res.status, headers: out })
  }
)
