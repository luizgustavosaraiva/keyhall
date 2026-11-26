// End-to-end tests: start the built server (dist/) on a temporary database and exercise the
// public surface the way a consumer and the panel do. Run with `pnpm test` after `pnpm build`.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash, createHmac, randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer, request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"

const serverDir = fileURLToPath(new URL("..", import.meta.url))
const fixture = fileURLToPath(new URL("fixtures/echo-mcp.mjs", import.meta.url))
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
)

const port = 18_000 + Math.floor(Math.random() * 2000)
const base = `http://127.0.0.1:${port}`
const dataDir = mkdtempSync(join(tmpdir(), "keyhall-test-"))
let proc
let log = ""
let cookie = ""

// Upstream HTTP API that records the headers keyhall sends.
let lastUpstream
const upstream = createServer((req, res) => {
  lastUpstream = {
    method: req.method,
    url: req.url,
    auth: req.headers["x-api-key"],
  }
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify({ ok: true, path: req.url }))
})

// Notification receiver: records every POST (Telegram's API, webhooks, ntfy).
const hooks = []
const hookServer = createServer(async (req, res) => {
  let body = ""
  for await (const chunk of req) body += chunk
  hooks.push({ url: req.url, headers: req.headers, body })
  res.statusCode = req.url.startsWith("/fail") ? 500 : 200
  res.end("{}")
})

// Remote MCP server that takes a fixed key instead of OAuth, and tells which headers reached it.
const REMOTE_KEY = "remote-key-1"
const remote = createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${REMOTE_KEY}`) {
    res.statusCode = 401
    return res.end()
  }
  const server = new McpServer({ name: "remote", version: "1.0.0" })
  server.registerTool(
    "whoami",
    { description: "Returns the client header" },
    async () => ({
      content: [{ type: "text", text: `client=${req.headers["x-client"]}` }],
    })
  )
  // Stateless: one server and transport per request.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  res.on("close", () => transport.close())
  await server.connect(transport)
  await transport.handleRequest(req, res)
})

// Fake Google: OAuth token endpoint, userinfo, and the few Gmail, Sheets and Calendar routes the
// tools use.
// Access tokens expire at once, so every call makes keyhall refresh first.
const google = {
  refreshes: 0,
  sent: undefined,
  event: undefined,
  eventQuery: undefined,
  codes: new Set(["good-code"]),
}
const googleServer = createServer(async (req, res) => {
  let raw = ""
  for await (const chunk of req) raw += chunk
  const url = new URL(req.url, "http://x")
  const json = (status, body) => {
    res.statusCode = status
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify(body))
  }
  if (url.pathname === "/token") {
    const form = new URLSearchParams(raw)
    if (form.get("client_secret") !== "g-secret")
      return json(401, { error: "invalid_client" })
    if (form.get("grant_type") === "authorization_code") {
      if (!google.codes.has(form.get("code")))
        return json(400, { error: "invalid_grant" })
      return json(200, {
        access_token: "at-0",
        refresh_token: "rt-1",
        expires_in: 1,
        scope: "openid email",
      })
    }
    if (form.get("refresh_token") !== "rt-1")
      return json(400, { error: "invalid_grant" })
    google.refreshes++
    return json(200, { access_token: `at-${google.refreshes}`, expires_in: 1 })
  }
  if (!/^Bearer at-\d+$/.test(req.headers.authorization ?? ""))
    return json(401, { error: { message: "bad token" } })
  if (url.pathname === "/userinfo")
    return json(200, { email: "someone@gmail.com" })
  const gmail = "/gmail/gmail/v1/users/me"
  if (url.pathname === `${gmail}/messages`)
    return json(200, { messages: [{ id: "m1" }] })
  if (url.pathname === `${gmail}/messages/m1`)
    return json(200, {
      id: "m1",
      threadId: "t1",
      snippet: "hi",
      payload: {
        headers: [
          { name: "From", value: "Ana <ana@example.com>" },
          { name: "Subject", value: "Olá" },
          { name: "Message-ID", value: "<abc@mail>" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from("corpo da mensagem").toString("base64url") },
      },
    })
  if (url.pathname === `${gmail}/messages/send`) {
    google.sent = JSON.parse(raw)
    return json(200, { id: "m2", threadId: google.sent.threadId })
  }
  if (url.pathname.startsWith("/sheets/v4/spreadsheets/s1/values/"))
    return json(200, {
      range: decodeURIComponent(url.pathname.split("/values/")[1]),
      values: [["a", "1"]],
    })
  const events = "/calendar/calendar/v3/calendars/primary/events"
  if (url.pathname === events && req.method === "GET")
    return json(200, {
      items: [
        {
          id: "e1",
          status: "confirmed",
          summary: "Reunião",
          start: { dateTime: "2026-11-20T14:00:00-03:00" },
          end: { dateTime: "2026-11-20T15:00:00-03:00" },
          attendees: [{ email: "ana@example.com", responseStatus: "accepted" }],
          htmlLink: "https://calendar.google.com/e1",
          etag: "x",
        },
      ],
      query: url.search,
    })
  if (url.pathname === events && req.method === "POST") {
    google.event = JSON.parse(raw)
    google.eventQuery = url.searchParams
    return json(200, {
      id: "e2",
      status: "confirmed",
      ...google.event,
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    })
  }
  json(404, { error: { message: `no route ${url.pathname}` } })
})

async function call(
  path,
  { method = "GET", body, token, admin = false, headers = {} } = {}
) {
  const h = { ...headers }
  if (body !== undefined) h["content-type"] = "application/json"
  if (token) h.authorization = `Bearer ${token}`
  if (admin) {
    h.cookie = cookie
    h.origin = base
  }
  const res = await fetch(base + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text, headers: res.headers }
}

async function mcp(token, method, params = {}) {
  const res = await call("/mcp", {
    method: "POST",
    token,
    headers: { accept: "application/json, text/event-stream" },
    body: { jsonrpc: "2.0", id: 1, method, params },
  })
  if (res.status !== 200) return res
  // Streamable HTTP may answer as JSON or as a single SSE event.
  const data = res.json ?? JSON.parse(res.text.match(/^data: (.*)$/m)[1])
  return { status: 200, ...data }
}

// GET with the path exactly as written (fetch would resolve dot segments first).
const rawGet = (path, token) =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        headers: { authorization: `Bearer ${token}` },
      },
      (res) => {
        res.resume()
        resolve(res.statusCode)
      }
    )
    req.on("error", reject)
    req.end()
  })

const waitFor = async (check, what, ms = 15_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = check()
    if (value) return value
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out waiting for ${what}\n${log}`)
}

before(async () => {
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r))
  await new Promise((r) => remote.listen(0, "127.0.0.1", r))
  await new Promise((r) => googleServer.listen(0, "127.0.0.1", r))
  await new Promise((r) => hookServer.listen(0, "127.0.0.1", r))
  proc = spawn(process.execPath, ["dist/index.js"], {
    cwd: serverDir,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABASE_PATH: join(dataDir, "keyhall.db"),
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      KEYHALL_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      BETTER_AUTH_URL: base,
      TRUSTED_ORIGINS: base,
      HOST: "127.0.0.1",
      PORT: String(port),
      KEYHALL_GOOGLE_CLIENT_ID: "login-client.apps.googleusercontent.com",
      KEYHALL_GOOGLE_CLIENT_SECRET: "login-secret",
      KEYHALL_GOOGLE_BASE: `http://127.0.0.1:${googleServer.address().port}`,
      KEYHALL_APPROVAL_WAIT_SECONDS: "2",
      KEYHALL_TELEGRAM_API: `http://127.0.0.1:${hookServer.address().port}/tg`,
    },
  })
  proc.stdout.on("data", (d) => (log += d))
  proc.stderr.on("data", (d) => (log += d))
  await waitFor(() => log.includes("listening"), "the server to start")
})

after(() => {
  proc?.kill()
  upstream.close()
  remote.close()
  googleServer.close()
  hookServer.close()
  rmSync(dataDir, { recursive: true, force: true })
})

describe("keyhall", () => {
  const ids = {}
  const tokens = {}

  test("health reports the package version", async () => {
    const res = await call("/api/health")
    assert.equal(res.status, 200)
    assert.deepEqual(res.json, { ok: true, version })
  })

  test("first-run setup needs the code from the log", async () => {
    assert.deepEqual((await call("/api/setup")).json, {
      needed: true,
      google: true,
    })
    const account = {
      name: "Test Admin",
      email: "admin@example.com",
      password: "a-long-test-password",
      organization: { name: "Acme", slug: "acme" },
    }
    const wrong = await call("/api/setup", {
      method: "POST",
      body: { ...account, code: "AAAA-AAAA" },
    })
    assert.equal(wrong.status, 403)
    const code = log.match(/Setup code: ([A-Z0-9]{4}-[A-Z0-9]{4})/)[1]
    const ok = await call("/api/setup", {
      method: "POST",
      body: { ...account, code },
    })
    assert.equal(ok.status, 201)
    const again = await call("/api/setup", {
      method: "POST",
      body: { ...account, code },
    })
    assert.equal(again.status, 409)
  })

  test("sign-up is closed and the admin can sign in", async () => {
    const signUp = await call("/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: base },
      body: { name: "X", email: "x@example.com", password: "another-password" },
    })
    assert.notEqual(signUp.status, 200)
    const signIn = await call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: base },
      body: { email: "admin@example.com", password: "a-long-test-password" },
    })
    assert.equal(signIn.status, 200)
    cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")
  })

  test("sign-in with Google goes to Google with keyhall's own callback", async () => {
    const res = await call("/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: base },
      body: { provider: "google", callbackURL: "/", errorCallbackURL: "/" },
    })
    assert.equal(res.status, 200, res.text)
    const url = new URL(res.json.url)
    assert.equal(url.host, "accounts.google.com")
    assert.equal(
      url.searchParams.get("client_id"),
      "login-client.apps.googleusercontent.com"
    )
    assert.equal(
      url.searchParams.get("redirect_uri"),
      `${base}/api/auth/callback/google`
    )
  })

  test("the admin API requires a session", async () => {
    assert.equal((await call("/api/admin/connections")).status, 401)
    assert.equal(
      (await call("/api/admin/connections", { admin: true })).status,
      200
    )
  })

  test("a QR code signs a phone in with a session of its own", async () => {
    const create = (admin) =>
      call("/api/auth/device-link/create", {
        method: "POST",
        admin,
        headers: { origin: base },
        body: {},
      })
    assert.equal((await create(false)).status, 401)
    const link = await create(true)
    assert.equal(link.status, 200, link.text)
    const redeem = () =>
      call("/api/auth/device-link/redeem", {
        method: "POST",
        headers: { origin: base },
        body: { token: link.json.token },
      })
    const first = await redeem()
    assert.equal(first.status, 200, first.text)
    const phone = first.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")
    const asPhone = (path) =>
      call(path, { headers: { cookie: phone, origin: base } })
    assert.equal((await asPhone("/api/admin/connections")).status, 200)
    // One use only.
    assert.equal((await redeem()).status, 400)
    // The phone's session is its own: signing it out keeps the admin's.
    const phoneSession = (await asPhone("/api/auth/get-session")).json.session
    const adminSession = (await call("/api/auth/get-session", { admin: true }))
      .json.session
    assert.notEqual(phoneSession.id, adminSession.id)
    const revoke = await call("/api/auth/revoke-session", {
      method: "POST",
      admin: true,
      body: { token: phoneSession.token },
    })
    assert.equal(revoke.status, 200, revoke.text)
    assert.equal((await asPhone("/api/admin/connections")).status, 401)
    assert.equal(
      (await call("/api/admin/connections", { admin: true })).status,
      200
    )
  })

  test("secrets and connections that reference them", async () => {
    const secret = await call("/api/admin/secrets", {
      method: "POST",
      admin: true,
      body: { projectId: "prj-default", name: "ECHO_KEY", value: "s3cret-v1" },
    })
    assert.equal(secret.status, 201)
    ids.secret = secret.json.id

    const missing = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "api",
        projectId: "prj-default",
        name: "Bad",
        slug: "bad",
        url: "http://127.0.0.1:1",
        authHeader: "X-Api-Key",
        authPrefix: "",
        secret: "{{secret:NOPE}}",
      },
    })
    assert.equal(missing.status, 400)

    const stdio = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "stdio",
        projectId: "prj-default",
        name: "Echo",
        slug: "echo",
        command: process.execPath,
        args: [fixture],
        env: { FOO: "{{secret:ECHO_KEY}}" },
      },
    })
    assert.equal(stdio.status, 201, stdio.text)
    assert.equal(stdio.json.status, "connected", stdio.text)
    ids.stdio = stdio.json.id

    const api = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "api",
        projectId: "prj-default",
        name: "Upstream",
        slug: "upstream",
        url: `http://127.0.0.1:${upstream.address().port}/base`,
        authHeader: "X-Api-Key",
        authPrefix: "",
        secret: "{{secret:ECHO_KEY}}",
      },
    })
    assert.equal(api.status, 201, api.text)
    ids.api = api.json.id
  })

  test("tokens for a project and for a scope", async () => {
    const project = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: { name: "project", target: { kind: "project", id: "prj-default" } },
    })
    assert.equal(project.status, 201)
    tokens.project = project.json.key
    assert.match(tokens.project, /^kh_/)

    const scope = await call("/api/admin/scopes", {
      method: "POST",
      admin: true,
      body: {
        orgId: "org-default",
        projectId: "prj-default",
        name: "Bot",
        slug: "bot",
        connectionIds: [ids.api],
      },
    })
    assert.equal(scope.status, 201, scope.text)
    ids.scope = scope.json.id
    const scoped = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: { name: "bot", target: { kind: "scope", id: ids.scope } },
    })
    tokens.scope = scoped.json.key
  })

  test("the MCP endpoint rejects missing and invalid tokens", async () => {
    assert.equal((await mcp(undefined, "tools/list")).status, 401)
    const invalid = await mcp("kh_invalid", "tools/list")
    assert.equal(invalid.status, 401)
    assert.match(
      invalid.headers.get("www-authenticate"),
      /error="invalid_token"/
    )
  })

  test("a project token lists and calls tools, with secrets resolved", async () => {
    const list = await mcp(tokens.project, "tools/list")
    const names = list.result.tools.map((t) => t.name)
    assert.ok(names.includes("echo__show_env"), names.join(", "))
    assert.ok(names.includes("echo__echo"))

    const env = await mcp(tokens.project, "tools/call", {
      name: "echo__show_env",
      arguments: {},
    })
    assert.equal(env.result.content[0].text, "FOO=s3cret-v1")

    const echo = await mcp(tokens.project, "tools/call", {
      name: "echo__echo",
      arguments: { text: "hello" },
    })
    assert.equal(echo.result.content[0].text, "hello")
  })

  test("a new secret value reaches the local server", async () => {
    const res = await call(`/api/admin/secrets/${ids.secret}`, {
      method: "PATCH",
      admin: true,
      body: { value: "s3cret-v2" },
    })
    assert.equal(res.status, 200)
    const env = await mcp(tokens.project, "tools/call", {
      name: "echo__show_env",
      arguments: {},
    })
    assert.equal(env.result.content[0].text, "FOO=s3cret-v2")
  })

  test("a scope token only sees its connections", async () => {
    const list = await mcp(tokens.scope, "tools/list")
    assert.deepEqual(list.result?.tools ?? [], [])
    const denied = await mcp(tokens.scope, "tools/call", {
      name: "echo__show_env",
      arguments: {},
    })
    assert.ok(denied.error || denied.result?.isError, JSON.stringify(denied))
  })

  test("the proxy injects the stored key", async () => {
    const res = await call("/api/proxy/default/upstream/v1/items?x=1", {
      token: tokens.scope,
    })
    assert.equal(res.status, 200, res.text)
    assert.equal(lastUpstream.url, "/base/v1/items?x=1")
    assert.equal(lastUpstream.auth, "s3cret-v2")
    // Sent raw, so no client normalizes the path before keyhall sees it.
    for (const path of [
      "../secret",
      "%2e%2e/secret",
      "..%2Fsecret",
      "a%5C..%5Csecret",
    ]) {
      lastUpstream = undefined
      const status = await rawGet(
        `/api/proxy/default/upstream/${path}`,
        tokens.scope
      )
      assert.notEqual(status, 200, path)
      assert.equal(lastUpstream, undefined, path)
    }
    const otherProject = await call("/api/proxy/other/upstream/v1", {
      token: tokens.scope,
    })
    assert.equal(otherProject.status, 404)
  })

  test("secrets over REST follow the token's reach", async () => {
    const read = await call("/api/secrets/ECHO_KEY", { token: tokens.project })
    assert.equal(read.status, 200)
    assert.equal(read.json.value, "s3cret-v2")
    const env = await call("/api/secrets?format=env", { token: tokens.project })
    assert.equal(env.text, "ECHO_KEY='s3cret-v2'\n")
    assert.equal(
      (await call("/api/secrets/ECHO_KEY", { token: tokens.scope })).status,
      404
    )
    assert.equal((await call("/api/secrets")).status, 401)
  })

  test("agents only get secret tools when allowed", async () => {
    let names = (await mcp(tokens.project, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(!names.includes("keyhall__get_secret"))
    await call(`/api/admin/secrets/${ids.secret}`, {
      method: "PATCH",
      admin: true,
      body: { agentAccess: true },
    })
    names = (await mcp(tokens.project, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(names.includes("keyhall__get_secret"))
    const got = await mcp(tokens.project, "tools/call", {
      name: "keyhall__get_secret",
      arguments: { name: "ECHO_KEY" },
    })
    assert.match(got.result.content[0].text, /s3cret-v2/)
  })

  test("tools that need approval wait for an admin", async () => {
    const rules = await call(`/api/admin/approvals/rules/${ids.stdio}`, {
      method: "PUT",
      admin: true,
      body: { tools: ["echo"] },
    })
    assert.equal(rules.status, 204, rules.text)
    const listed = (await mcp(tokens.project, "tools/list")).result.tools
    assert.match(
      listed.find((t) => t.name === "echo__echo").description,
      /^\[Needs approval/
    )
    const echo = (text) =>
      mcp(tokens.project, "tools/call", {
        name: "echo__echo",
        arguments: { text },
      })
    const pendingFor = async (text) => {
      for (let i = 0; i < 50; i++) {
        const list = await call("/api/admin/approvals", { admin: true })
        const found = list.json.find(
          (a) => a.status === "pending" && a.args?.text === text
        )
        if (found) return found
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`no pending approval for ${text}`)
    }

    // Timing: the environment gives the starting values; the panel changes them.
    const timing = await call("/api/admin/approvals/settings", { admin: true })
    assert.equal(timing.json.waitSeconds, 2)
    assert.equal(timing.json.validMinutes, 15)
    const tooLong = await call("/api/admin/approvals/settings", {
      method: "PUT",
      admin: true,
      body: { waitSeconds: 60, validMinutes: 30 },
    })
    assert.equal(tooLong.status, 400)
    const saved = await call("/api/admin/approvals/settings", {
      method: "PUT",
      admin: true,
      body: { waitSeconds: 2, validMinutes: 30 },
    })
    assert.equal(saved.status, 200, saved.text)

    // Nobody decides in time: the agent is told to repeat the call once approved.
    const waiting = await echo("a")
    assert.equal(waiting.result.isError, true)
    assert.match(waiting.result.content[0].text, /waiting for an admin/)
    const req = await pendingFor("a")
    assert.equal(req.tool, "echo")
    assert.equal(req.tokenName, "project")
    assert.equal(req.requestedBy, "admin@example.com")
    const validFor = new Date(req.expiresAt) - new Date(req.createdAt)
    assert.ok(Math.abs(validFor - 30 * 60_000) < 2000, String(validFor))
    const approve = (id, decision = "approve") =>
      call(`/api/admin/approvals/${id}/${decision}`, {
        method: "POST",
        admin: true,
      })
    assert.equal((await approve(req.id)).status, 204)
    assert.equal((await approve(req.id)).status, 409)
    assert.equal((await echo("a")).result.content[0].text, "a")
    // Used once: the same call asks again.
    assert.equal((await echo("a")).result.isError, true)

    // Approved while the call waits: it runs in place.
    const live = echo("b")
    await approve((await pendingFor("b")).id)
    assert.equal((await live).result.content[0].text, "b")

    // Denied while it waits.
    const refused = echo("c")
    await approve((await pendingFor("c")).id, "deny")
    const denied = await refused
    assert.equal(denied.result.isError, true)
    assert.match(denied.result.content[0].text, /denied/)

    // Other tools of the connection never wait; without rules, nothing does.
    const env = await mcp(tokens.project, "tools/call", {
      name: "echo__show_env",
      arguments: {},
    })
    assert.ok(!env.result.isError)
    await call(`/api/admin/approvals/rules/${ids.stdio}`, {
      method: "PUT",
      admin: true,
      body: { tools: [] },
    })
    assert.equal((await echo("d")).result.content[0].text, "d")
  })

  test("approval requests notify the admin's channels", async () => {
    const hookBase = `http://127.0.0.1:${hookServer.address().port}`
    const channel = (body) =>
      call("/api/admin/notifications", { method: "POST", admin: true, body })
    assert.equal(
      (await channel({ name: "x", kind: "discord", fields: {} })).status,
      400
    )
    assert.equal(
      (
        await channel({
          name: "x",
          kind: "webhook",
          fields: { url: "ftp://example.com" },
        })
      ).status,
      400
    )
    const hook = await channel({
      name: "Automation",
      kind: "webhook",
      fields: { url: `${hookBase}/hook`, secret: "hook-secret" },
    })
    assert.equal(hook.status, 201, hook.text)
    // Secret fields never come back.
    assert.equal(hook.json.fields.secret, "")
    assert.deepEqual(hook.json.secretsSet, ["secret"])
    const tg = await channel({
      name: "Phone",
      kind: "telegram",
      fields: { botToken: "123:abc", chatId: "42" },
      includeArgs: true,
    })
    assert.equal(tg.status, 201, tg.text)
    const broken = await channel({
      name: "Broken",
      kind: "ntfy",
      fields: { url: `${hookBase}/fail` },
    })

    // HMAC-SHA256 of the raw body with the channel's secret.
    const verify = (h) =>
      h.headers["x-keyhall-signature"] ===
      `sha256=${createHmac("sha256", "hook-secret").update(h.body).digest("hex")}`

    // The test button sends a sample at once and reports failures.
    hooks.length = 0
    const tested = await call(`/api/admin/notifications/${hook.json.id}/test`, {
      method: "POST",
      admin: true,
    })
    assert.equal(tested.status, 204, tested.text)
    assert.equal(hooks.length, 1)
    assert.ok(verify(hooks[0]), "signature")
    const failed = await call(
      `/api/admin/notifications/${broken.json.id}/test`,
      { method: "POST", admin: true }
    )
    assert.equal(failed.status, 502)
    const listed = await call("/api/admin/notifications", { admin: true })
    assert.match(
      listed.json.channels.find((c) => c.name === "Broken").lastError,
      /^500/
    )
    await call(`/api/admin/notifications/${broken.json.id}`, {
      method: "PATCH",
      admin: true,
      body: { enabled: false },
    })

    // A new request reaches every enabled channel; arguments only where asked.
    await call(`/api/admin/approvals/rules/${ids.stdio}`, {
      method: "PUT",
      admin: true,
      body: { tools: ["echo"] },
    })
    hooks.length = 0
    const pending = await mcp(tokens.project, "tools/call", {
      name: "echo__echo",
      arguments: { text: "notify me" },
    })
    assert.equal(pending.result.isError, true)
    await waitFor(() => hooks.length >= 2, "two notifications")
    assert.ok(!hooks.some((h) => h.url.startsWith("/fail")))
    const telegram = hooks.find((h) => h.url === "/tg/bot123:abc/sendMessage")
    const sent = JSON.parse(telegram.body)
    assert.equal(sent.chat_id, "42")
    assert.match(sent.text, /echo__echo/)
    assert.match(sent.text, /notify me/)
    assert.match(sent.text, /#approvals/)
    const webhook = hooks.find((h) => h.url === "/hook")
    assert.ok(verify(webhook), "signature")
    const payload = JSON.parse(webhook.body)
    assert.equal(payload.event, "approval.requested")
    assert.equal(payload.approval.name, "echo__echo")
    assert.equal(payload.approval.args, undefined)

    // Editing without the secret keeps it.
    await call(`/api/admin/notifications/${hook.json.id}`, {
      method: "PATCH",
      admin: true,
      body: { fields: { url: `${hookBase}/hook`, secret: "" } },
    })
    hooks.length = 0
    await call(`/api/admin/notifications/${hook.json.id}/test`, {
      method: "POST",
      admin: true,
    })
    assert.ok(verify(hooks[0]), "signature kept")

    await call(`/api/admin/approvals/rules/${ids.stdio}`, {
      method: "PUT",
      admin: true,
      body: { tools: [] },
    })
    for (const ch of [hook, tg, broken])
      await call(`/api/admin/notifications/${ch.json.id}`, {
        method: "DELETE",
        admin: true,
      })
  })

  test("team: an invited member reaches only what was granted", async () => {
    const asMember = (memberCookie) => ({ cookie: memberCookie, origin: base })
    const invited = await call("/api/admin/members", {
      method: "POST",
      admin: true,
      body: { orgId: "org-default", email: "Ana@Example.com" },
    })
    assert.equal(invited.status, 201, invited.text)
    const code = invited.json.link.split("#invite=")[1]
    assert.ok(code)
    const memberId = invited.json.id
    const again = await call("/api/admin/members", {
      method: "POST",
      admin: true,
      body: { orgId: "org-default", email: "ana@example.com" },
    })
    assert.equal(again.status, 409)
    const adminInvite = await call("/api/admin/members", {
      method: "POST",
      admin: true,
      body: { orgId: "org-default", email: "admin@example.com" },
    })
    assert.equal(adminInvite.status, 409)

    // Grants: one tool of the local server, the "bot" scope and the secret.
    const foreign = await call(`/api/admin/members/${memberId}/grants`, {
      method: "PUT",
      admin: true,
      body: { scopeIds: ["no-such-scope"] },
    })
    assert.equal(foreign.status, 400)
    const grants = await call(`/api/admin/members/${memberId}/grants`, {
      method: "PUT",
      admin: true,
      body: {
        connections: { [ids.stdio]: ["echo"] },
        scopeIds: [ids.scope],
        secretIds: [ids.secret],
      },
    })
    assert.equal(grants.status, 204, grants.text)
    const listed = await call("/api/admin/members", { admin: true })
    const row = listed.json.find((m) => m.id === memberId)
    assert.equal(row.email, "ana@example.com")
    assert.equal(row.status, "invited")
    assert.deepEqual(row.connections, { [ids.stdio]: ["echo"] })

    // The link: who and where, then an account with a password. It works once.
    const info = await call(`/api/invite/${code}`)
    assert.equal(info.status, 200)
    assert.equal(info.json.email, "ana@example.com")
    assert.equal(info.json.existing, false)
    const accepted = await call(`/api/invite/${code}/accept`, {
      method: "POST",
      body: { name: "Ana", password: "ana-long-password" },
    })
    assert.equal(accepted.status, 200, accepted.text)
    assert.equal((await call(`/api/invite/${code}`)).status, 404)

    const signIn = await call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: base },
      body: { email: "ana@example.com", password: "ana-long-password" },
    })
    assert.equal(signIn.status, 200)
    const memberCookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")
    const headers = asMember(memberCookie)

    // Not an admin: the admin API is closed; their own side lists the grants, without secrets.
    assert.equal(
      (await call("/api/admin/connections", { headers })).status,
      403
    )
    const reach = await call("/api/me/reach", { headers })
    assert.equal(reach.json.length, 1)
    assert.equal(reach.json[0].memberId, memberId)
    assert.deepEqual(
      reach.json[0].connections.map((c) => [c.slug, c.allowedTools]),
      [["echo", ["echo"]]]
    )
    assert.ok(!("url" in reach.json[0].connections[0]))
    assert.deepEqual(
      reach.json[0].scopes.map((s) => s.slug),
      ["bot"]
    )
    assert.deepEqual(
      reach.json[0].secrets.map((s) => s.name),
      ["ECHO_KEY"]
    )

    // Their tokens: only their grants or a granted scope.
    const outside = await call("/api/me/tokens", {
      method: "POST",
      headers,
      body: { name: "x", target: { kind: "member", id: "someone-else" } },
    })
    assert.equal(outside.status, 404)
    const created = await call("/api/me/tokens", {
      method: "POST",
      headers,
      body: {
        name: "ana",
        target: { kind: "member", id: memberId },
        mode: "tools",
      },
    })
    assert.equal(created.status, 201, created.text)
    const token = created.json.key
    const names = (await mcp(token, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(names.includes("default__echo__echo"), names.join(", "))
    assert.ok(!names.includes("default__echo__show_env"))
    assert.ok(names.includes("keyhall__get_secret"))
    const blocked = await mcp(token, "tools/call", {
      name: "default__echo__show_env",
      arguments: {},
    })
    assert.ok(blocked.error || blocked.result?.isError)
    const echo = await mcp(token, "tools/call", {
      name: "default__echo__echo",
      arguments: { text: "oi" },
    })
    assert.equal(echo.result.content[0].text, "oi")
    assert.equal((await call("/api/secrets/ECHO_KEY", { token })).status, 200)
    const mine = await call("/api/me/tokens", { headers })
    assert.deepEqual(
      mine.json.map((k) => k.name),
      ["ana"]
    )

    // A member approves OAuth clients within their grants only.
    const registered = await call("/oauth/register", {
      method: "POST",
      body: { redirect_uris: ["https://client.example/cb"] },
    })
    const request = {
      response_type: "code",
      client_id: registered.json.client_id,
      redirect_uri: "https://client.example/cb",
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
    }
    const approve = (target) =>
      call("/api/mcp-oauth/approve", {
        method: "POST",
        headers,
        body: { request, target },
      })
    assert.equal(
      (await approve({ kind: "project", id: "prj-default" })).status,
      404
    )
    assert.equal((await approve({ kind: "scope", id: ids.scope })).status, 200)

    // Taking grants away takes effect on the next call.
    await call(`/api/admin/members/${memberId}/grants`, {
      method: "PUT",
      admin: true,
      body: {},
    })
    const after = (await mcp(token, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(!after.includes("default__echo__echo"), after.join(", "))
    assert.equal((await call("/api/secrets/ECHO_KEY", { token })).status, 404)

    // Removing the member ends their tokens, sessions and account.
    const removed = await call(`/api/admin/members/${memberId}`, {
      method: "DELETE",
      admin: true,
    })
    assert.equal(removed.status, 204)
    assert.equal((await mcp(token, "tools/list")).status, 401)
    assert.equal((await call("/api/me/reach", { headers })).status, 401)
    const gone = await call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: base },
      body: { email: "ana@example.com", password: "ana-long-password" },
    })
    assert.notEqual(gone.status, 200)
  })

  test("Code Mode: search finds tools and execute calls them from code", async () => {
    const created = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: {
        name: "code",
        target: { kind: "project", id: "prj-default" },
        mode: "code",
      },
    })
    assert.equal(created.status, 201, created.text)
    const token = created.json.key
    const tool = async (name, args) =>
      (await mcp(token, "tools/call", { name, arguments: args })).result

    const list = await mcp(token, "tools/list")
    assert.deepEqual(
      list.result.tools.map((t) => t.name),
      ["search", "execute"]
    )
    assert.match(list.result.tools[0].description, /echo \(Echo\)/)

    const found = await tool("search", { query: "echoes text" })
    assert.match(
      found.content[0].text,
      /^echo__echo\n {2}Echoes the text back/m
    )
    assert.match(found.content[0].text, /input: \{\n {4}text: string/)
    const byPrefix = await tool("search", { query: "echo" })
    assert.match(byPrefix.content[0].text, /echo__show_env/)

    const run = await tool("execute", {
      code: `const [said, env] = await Promise.all([
        call("echo__echo", { text: "hi" }),
        call("echo__show_env"),
      ])
      console.log("got", said)
      const secret = await call("keyhall__get_secret", { name: "ECHO_KEY" })
      return { said, env, secret: secret.length }`,
    })
    assert.ok(!run.isError, run.content[0].text)
    assert.equal(
      run.content[0].text,
      '{"said":"hi","env":"FOO=s3cret-v2","secret":9}\n\nconsole:\ngot hi'
    )

    const catalog = await tool("execute", {
      code: `const all = await tools()
      const echo = await tools("echo__")
      const found = all.filter((t) => /back/i.test(t.description)).map((t) => t.name)
      return { total: all.length, echo: echo.length, found, input: echo.find((t) => t.name === "echo__echo").input }`,
    })
    assert.ok(!catalog.isError, catalog.content[0].text)
    const listed = JSON.parse(catalog.content[0].text)
    assert.ok(
      listed.total >= listed.echo && listed.echo > 1,
      catalog.content[0].text
    )
    assert.ok(listed.found.includes("echo__echo"), catalog.content[0].text)
    assert.match(listed.input, /text: string/)

    const denied = await tool("execute", {
      code: `return await call("other__tool", {})`,
    })
    assert.equal(denied.isError, true)
    assert.match(denied.content[0].text, /Tool not allowed: other__tool/)

    const sandboxed = await tool("execute", {
      code: "return [typeof fetch, typeof require, typeof process]",
    })
    assert.equal(
      sandboxed.content[0].text,
      '["undefined","undefined","undefined"]'
    )

    const tokenList = await call("/api/admin/tokens", { admin: true })
    const row = tokenList.json.find((t) => t.name === "code")
    assert.equal(row.mode, "code")
    const switched = await call(`/api/admin/tokens/${row.id}`, {
      method: "PATCH",
      admin: true,
      body: { mode: "tools" },
    })
    assert.equal(switched.status, 204, switched.text)
    const names = (await mcp(token, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(names.includes("echo__echo"), names.join(", "))
  })

  test("MCP clients get a token by OAuth, approved in the panel", async () => {
    // Discovery: the 401 points to the resource metadata, which names keyhall as the server.
    const bare = await mcp(undefined, "tools/list")
    assert.equal(bare.status, 401)
    const metaUrl = bare.headers
      .get("www-authenticate")
      .match(/resource_metadata="([^"]+)"/)[1]
    assert.equal(metaUrl, `${base}/.well-known/oauth-protected-resource/mcp`)
    const resource = await call(new URL(metaUrl).pathname)
    assert.equal(resource.json.resource, `${base}/mcp`)
    const server = await call("/.well-known/oauth-authorization-server")
    assert.equal(server.json.issuer, resource.json.authorization_servers[0])
    assert.equal(server.json.authorization_endpoint, `${base}/oauth/authorize`)
    assert.deepEqual(server.json.code_challenge_methods_supported, ["S256"])

    const refused = await call("/oauth/register", {
      method: "POST",
      body: { redirect_uris: ["http://evil.example/cb"] },
    })
    assert.equal(refused.status, 400)
    const registered = await call("/oauth/register", {
      method: "POST",
      body: {
        redirect_uris: ["https://client.example/cb"],
        client_name: "Test Client",
      },
    })
    assert.equal(registered.status, 201, registered.text)
    const clientId = registered.json.client_id

    const verifier = randomBytes(32).toString("base64url")
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    const request = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: "https://client.example/cb",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "st-1",
      scope: "mcp",
    }
    // The consent page needs a panel session, and refuses a redirect the client didn't register.
    assert.equal(
      (await call("/api/mcp-oauth/check", { method: "POST", body: request }))
        .status,
      401
    )
    const checked = await call("/api/mcp-oauth/check", {
      method: "POST",
      admin: true,
      body: request,
    })
    assert.deepEqual(checked.json, {
      client: "Test Client",
      redirectHost: "client.example",
    })
    const forged = await call("/api/mcp-oauth/check", {
      method: "POST",
      admin: true,
      body: { ...request, redirect_uri: "https://evil.example/cb" },
    })
    assert.equal(forged.status, 400)
    const tampered = await call("/api/mcp-oauth/check", {
      method: "POST",
      admin: true,
      body: { ...request, client_id: `${clientId.split(".")[0]}.x` },
    })
    assert.equal(tampered.status, 400)

    const denied = await call("/api/mcp-oauth/deny", {
      method: "POST",
      admin: true,
      body: { request },
    })
    const deniedUrl = new URL(denied.json.redirect)
    assert.equal(deniedUrl.searchParams.get("error"), "access_denied")
    assert.equal(deniedUrl.searchParams.get("state"), "st-1")

    const approve = async () => {
      const res = await call("/api/mcp-oauth/approve", {
        method: "POST",
        admin: true,
        body: {
          request,
          target: { kind: "project", id: "prj-default" },
          mode: "tools",
        },
      })
      assert.equal(res.status, 200, res.text)
      const url = new URL(res.json.redirect)
      assert.equal(url.origin + url.pathname, "https://client.example/cb")
      assert.equal(url.searchParams.get("state"), "st-1")
      return url.searchParams.get("code")
    }
    const exchange = (code, codeVerifier) =>
      fetch(`${base}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://client.example/cb",
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      }).then(async (r) => ({ status: r.status, json: await r.json() }))

    const wrong = await exchange(await approve(), "x".repeat(43))
    assert.equal(wrong.status, 400)
    assert.equal(wrong.json.error, "invalid_grant")

    const code = await approve()
    const token = await exchange(code, verifier)
    assert.equal(token.status, 200, JSON.stringify(token.json))
    assert.equal(token.json.token_type, "Bearer")
    assert.match(token.json.access_token, /^kh_/)
    assert.equal((await exchange(code, verifier)).status, 400)

    const list = await mcp(token.json.access_token, "tools/list")
    assert.equal(list.status, 200)
    assert.ok(list.result.tools.length > 0)
    // It's a regular token: listed on the Tokens page and revocable there.
    const tokensList = await call("/api/admin/tokens", { admin: true })
    const issued = tokensList.json.find((k) => k.name === "Test Client (OAuth)")
    assert.deepEqual(issued.target, { kind: "project", id: "prj-default" })
    await call(`/api/admin/tokens/${issued.id}`, {
      method: "DELETE",
      admin: true,
    })
    assert.equal((await mcp(token.json.access_token, "tools/list")).status, 401)
  })

  test("a secret in use can't be deleted", async () => {
    const res = await call(`/api/admin/secrets/${ids.secret}`, {
      method: "DELETE",
      admin: true,
    })
    assert.equal(res.status, 409)
  })

  test("revoked tokens stop working", async () => {
    const list = await call("/api/admin/tokens", { admin: true })
    const bot = list.json.find((t) => t.name === "bot")
    const del = await call(`/api/admin/tokens/${bot.id}`, {
      method: "DELETE",
      admin: true,
    })
    assert.ok(del.status < 300, del.text)
    assert.equal((await mcp(tokens.scope, "tools/list")).status, 401)
  })

  test("a remote MCP server with fixed headers instead of OAuth", async () => {
    const remoteUrl = `http://127.0.0.1:${remote.address().port}/mcp`
    const secret = await call("/api/admin/secrets", {
      method: "POST",
      admin: true,
      body: { projectId: "prj-default", name: "REMOTE_KEY", value: REMOTE_KEY },
    })
    assert.equal(secret.status, 201, secret.text)

    const body = (headers) => ({
      kind: "mcp",
      projectId: "prj-default",
      name: "Remote",
      slug: "remote",
      url: remoteUrl,
      headers,
    })
    const missing = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: body({ Authorization: "Bearer {{secret:NOPE}}" }),
    })
    assert.equal(missing.status, 400)

    const created = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: body({
        Authorization: "Bearer {{secret:REMOTE_KEY}}",
        "X-Client": "grok",
      }),
    })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.status, "connected", created.text)
    assert.deepEqual(created.json.headerNames, ["Authorization", "X-Client"])
    // The reference goes back to the panel; the literal value doesn't.
    assert.deepEqual(created.json.headerRefs, {
      Authorization: "Bearer {{secret:REMOTE_KEY}}",
    })
    assert.ok(!created.text.includes(REMOTE_KEY))
    const id = created.json.id

    const token = (
      await call("/api/admin/tokens", {
        method: "POST",
        admin: true,
        body: {
          name: "remote",
          target: { kind: "project", id: "prj-default" },
        },
      })
    ).json.key
    const whoami = () =>
      mcp(token, "tools/call", { name: "remote__whoami", arguments: {} })
    assert.equal((await whoami()).result.content[0].text, "client=grok")

    // An empty value keeps the current key; a header left out is removed.
    const kept = await call(`/api/admin/connections/${id}`, {
      method: "PATCH",
      admin: true,
      body: { headers: { Authorization: "" } },
    })
    assert.equal(kept.json.status, "connected", kept.text)
    assert.deepEqual(kept.json.headerNames, ["Authorization"])
    assert.equal((await whoami()).result.content[0].text, "client=undefined")

    const wrong = await call(`/api/admin/connections/${id}`, {
      method: "PATCH",
      admin: true,
      body: { headers: { Authorization: "Bearer nope" } },
    })
    assert.equal(wrong.json.status, "error", wrong.text)
  })
  test("an API spec uploaded as a file exposes only its routes", async () => {
    const spec = (paths) =>
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Trimmed", version: "1" },
        paths,
      })
    const body = (extra) => ({
      kind: "api",
      projectId: "prj-default",
      name: "Trimmed",
      slug: "trimmed",
      url: `http://127.0.0.1:${upstream.address().port}/base`,
      authHeader: "X-Api-Key",
      authPrefix: "",
      secret: "k",
      ...extra,
    })
    const invalid = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: body({ spec: '{"swagger":"2.0"}' }),
    })
    assert.equal(invalid.status, 400, invalid.text)
    const both = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: body({ spec: spec({}), specUrl: "https://example.com/o.json" }),
    })
    assert.equal(both.status, 400, both.text)

    const created = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: body({
        spec: spec({
          "/v1/items": { get: { operationId: "listItems" } },
          "/v1/items/{id}": {
            get: {
              operationId: "getItem",
              parameters: [{ name: "id", in: "path", required: true }],
            },
          },
        }),
      }),
    })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.status, "connected", created.text)
    assert.equal(created.json.specSource, "file")
    assert.equal(created.json.specUrl, null)
    const id = created.json.id
    const tools = await call(`/api/admin/connections/${id}/tools`, {
      admin: true,
    })
    assert.deepEqual(tools.json.map((t) => t.name).sort(), [
      "getItem",
      "listItems",
    ])

    // Reconnecting keeps the uploaded spec; a new file replaces it.
    const again = await call(`/api/admin/connections/${id}/connect`, {
      method: "POST",
      admin: true,
    })
    assert.equal(again.json.status, "connected", again.text)
    const replaced = await call(`/api/admin/connections/${id}`, {
      method: "PATCH",
      admin: true,
      body: { spec: spec({ "/v1/ping": { post: { operationId: "ping" } } }) },
    })
    assert.equal(replaced.status, 200, replaced.text)
    const after = await call(`/api/admin/connections/${id}/tools`, {
      admin: true,
    })
    assert.deepEqual(
      after.json.map((t) => t.name),
      ["ping"]
    )
    await call(`/api/admin/connections/${id}`, {
      method: "DELETE",
      admin: true,
    })
  })

  test("the catalog lists one-click connections and native plugins", async () => {
    const res = await call("/api/admin/catalog", { admin: true })
    assert.equal(res.status, 200)
    const linear = res.json.entries.find((e) => e.slug === "linear")
    assert.equal(linear.connect.url, "https://mcp.linear.app/mcp")
    // OAuth by default, with an optional key on the same address.
    assert.equal(linear.connect.key.optional, true)
    const render = res.json.entries.find((e) => e.slug === "render")
    assert.ok(!render.connect.key.optional, "Render needs its key")
    // Icons come from keyhall itself; the vendor's address stays on the server.
    assert.equal(linear.icon, "/api/admin/catalog/linear/icon")
    assert.ok(!("iconUrl" in linear))
    const none = await call("/api/admin/catalog/no-such-entry/icon", {
      admin: true,
    })
    assert.equal(none.status, 404)
    assert.deepEqual(
      res.json.native.google.features.map((f) => f.id),
      ["gmail", "drive", "sheets", "calendar"]
    )
    const bad = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "mcp",
        projectId: "prj-default",
        name: "X",
        slug: "x",
        url: "https://example.com/mcp",
        plugin: "no-such-entry",
      },
    })
    assert.equal(bad.status, 400)
  })

  test("native plugin (Google): own OAuth client, consent, refresh and tools", async () => {
    await call("/api/admin/secrets", {
      method: "POST",
      admin: true,
      body: { projectId: "prj-default", name: "G_SECRET", value: "g-secret" },
    })
    const created = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "native",
        native: "google",
        projectId: "prj-default",
        name: "Google",
        slug: "google",
        fields: {
          clientId: "g-client.apps.googleusercontent.com",
          clientSecret: "{{secret:G_SECRET}}",
        },
        features: ["sheets", "gmail", "nope"],
      },
    })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.status, "pending")
    assert.equal(created.json.plugin, null)
    assert.deepEqual(created.json.native, {
      native: "google",
      fields: {
        clientId: "g-client.apps.googleusercontent.com",
        clientSecret: "{{secret:G_SECRET}}",
      },
      features: ["gmail", "sheets"],
      account: null,
    })
    const id = created.json.id

    const start = await call(`/api/admin/connections/${id}/connect`, {
      method: "POST",
      admin: true,
    })
    assert.equal(start.json.status, "authorize", start.text)
    const consent = new URL(start.json.authorizationUrl)
    assert.equal(consent.searchParams.get("access_type"), "offline")
    assert.equal(consent.searchParams.get("prompt"), "consent")
    assert.equal(
      consent.searchParams.get("redirect_uri"),
      `${base}/api/oauth/callback`
    )
    const scopes = new Set(consent.searchParams.get("scope").split(" "))
    assert.ok(scopes.has("https://www.googleapis.com/auth/gmail.modify"))
    assert.ok(scopes.has("https://www.googleapis.com/auth/spreadsheets"))
    assert.ok(![...scopes].some((s) => s.endsWith("/drive.readonly")))

    const back = await fetch(
      `${base}/api/oauth/callback?code=good-code&state=${consent.searchParams.get("state")}`,
      { headers: { cookie }, redirect: "manual" }
    )
    assert.equal(back.headers.get("location"), "/?oauth=ok&conexao=google")
    const [conn] = (
      await call("/api/admin/connections", { admin: true })
    ).json.filter((c) => c.id === id)
    assert.equal(conn.status, "connected")
    assert.equal(conn.native.account, "someone@gmail.com")

    const token = (
      await call("/api/admin/tokens", {
        method: "POST",
        admin: true,
        body: { name: "g", target: { kind: "project", id: "prj-default" } },
      })
    ).json.key
    const names = (await mcp(token, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(names.includes("google__gmail_send"), names.join(", "))
    assert.ok(names.includes("google__sheets_read"))
    assert.ok(!names.some((n) => n.startsWith("google__drive_")))

    const before = google.refreshes
    const found = await mcp(token, "tools/call", {
      name: "google__gmail_search",
      arguments: { query: "is:unread" },
    })
    assert.equal(JSON.parse(found.result.content[0].text)[0].subject, "Olá")
    assert.ok(google.refreshes > before, "expired token was refreshed")

    const reply = await mcp(token, "tools/call", {
      name: "google__gmail_send",
      arguments: { replyToMessageId: "m1", body: "Obrigado!" },
    })
    assert.ok(!reply.result.isError, reply.result.content[0].text)
    assert.equal(google.sent.threadId, "t1")
    const mime = Buffer.from(google.sent.raw, "base64url").toString("utf8")
    assert.match(mime, /^To: Ana <ana@example.com>\r\n/)
    assert.match(mime, /Subject: =\?UTF-8\?B\?/)
    assert.match(mime, /In-Reply-To: <abc@mail>/)

    const cells = await mcp(token, "tools/call", {
      name: "google__sheets_read",
      arguments: { spreadsheetId: "s1", range: "Aba!A1:B2" },
    })
    assert.equal(JSON.parse(cells.result.content[0].text).range, "Aba!A1:B2")

    // A catalog entry is one service: its features win over the request's.
    const sheetsOnly = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "native",
        native: "google",
        plugin: "google-sheets",
        projectId: "prj-default",
        name: "Planilhas",
        slug: "planilhas",
        fields: {
          clientId: "g-client.apps.googleusercontent.com",
          clientSecret: "{{secret:G_SECRET}}",
        },
        features: ["gmail", "drive"],
      },
    })
    assert.equal(sheetsOnly.status, 201, sheetsOnly.text)
    assert.deepEqual(sheetsOnly.json.native.features, ["sheets"])
    const wrongKind = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "native",
        native: "google",
        plugin: "linear",
        projectId: "prj-default",
        name: "X",
        slug: "x-native",
        fields: { clientId: "a", clientSecret: "b" },
      },
    })
    assert.equal(wrongKind.status, 400)

    // Other services need another consent: tokens are dropped.
    const changed = await call(`/api/admin/connections/${id}`, {
      method: "PATCH",
      admin: true,
      body: { features: ["drive"] },
    })
    assert.equal(changed.json.status, "pending", changed.text)
    assert.equal(changed.json.native.account, null)
    assert.ok(!JSON.stringify(changed.json).includes("g-secret"))
  })

  test("Google Calendar: its own scopes, events listed and created with a Meet link", async () => {
    const created = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "native",
        native: "google",
        plugin: "google-calendar",
        projectId: "prj-default",
        name: "Agenda",
        slug: "agenda",
        fields: {
          clientId: "g-client.apps.googleusercontent.com",
          clientSecret: "{{secret:G_SECRET}}",
        },
      },
    })
    assert.equal(created.status, 201, created.text)
    assert.deepEqual(created.json.native.features, ["calendar"])
    const start = await call(
      `/api/admin/connections/${created.json.id}/connect`,
      { method: "POST", admin: true }
    )
    const consent = new URL(start.json.authorizationUrl)
    const scopes = consent.searchParams.get("scope").split(" ")
    assert.deepEqual(scopes.filter((s) => s.includes("/auth/")).sort(), [
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ])
    await fetch(
      `${base}/api/oauth/callback?code=good-code&state=${consent.searchParams.get("state")}`,
      { headers: { cookie }, redirect: "manual" }
    )

    const token = (
      await call("/api/admin/tokens", {
        method: "POST",
        admin: true,
        body: {
          name: "agenda",
          target: { kind: "project", id: "prj-default" },
        },
      })
    ).json.key
    const names = (await mcp(token, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(names.includes("agenda__calendar_create_event"), names.join(", "))
    assert.ok(!names.some((n) => n.startsWith("agenda__gmail_")))

    const listed = await mcp(token, "tools/call", {
      name: "agenda__calendar_list_events",
      arguments: { query: "reunião" },
    })
    assert.ok(!listed.result.isError, listed.result.content[0].text)
    const [event] = JSON.parse(listed.result.content[0].text)
    assert.deepEqual(event, {
      id: "e1",
      summary: "Reunião",
      start: "2026-11-20T14:00:00-03:00",
      end: "2026-11-20T15:00:00-03:00",
      allDay: false,
      attendees: [{ email: "ana@example.com", response: "accepted" }],
      status: "confirmed",
      link: "https://calendar.google.com/e1",
    })

    const made = await mcp(token, "tools/call", {
      name: "agenda__calendar_create_event",
      arguments: {
        summary: "Café",
        start: "2026-11-21T09:00:00",
        end: "2026-11-21T09:30:00",
        timeZone: "America/Sao_Paulo",
        attendees: ["bia@example.com"],
        meet: true,
      },
    })
    assert.ok(!made.result.isError, made.result.content[0].text)
    assert.equal(
      JSON.parse(made.result.content[0].text).meet,
      "https://meet.google.com/abc-defg-hij"
    )
    assert.deepEqual(google.event.start, {
      dateTime: "2026-11-21T09:00:00",
      timeZone: "America/Sao_Paulo",
    })
    assert.deepEqual(google.event.attendees, [{ email: "bia@example.com" }])
    assert.equal(
      google.event.conferenceData.createRequest.conferenceSolutionKey.type,
      "hangoutsMeet"
    )
    assert.equal(google.eventQuery.get("conferenceDataVersion"), "1")
    assert.equal(google.eventQuery.get("sendUpdates"), "none")
  })

  test("remote MCP connection with a static OAuth client uses vault references", async () => {
    const projectId = "prj-default"
    for (const [name, value] of [
      ["GMCP_CLIENT_ID", "static-cid.apps.googleusercontent.com"],
      ["GMCP_CLIENT_SECRET", "static-csec-123"],
    ]) {
      const res = await call("/api/admin/secrets", {
        method: "POST",
        admin: true,
        body: { projectId, name, value },
      })
      assert.equal(res.status, 201, res.text)
    }

    const created = await call("/api/admin/connections", {
      method: "POST",
      admin: true,
      body: {
        kind: "mcp",
        projectId,
        name: "Google Tasks MCP",
        slug: "google-tasks-mcp",
        plugin: "google-tasks-mcp",
        url: "https://tasksmcp.googleapis.com/mcp/v1",
        oauthClient: {
          clientId: "{{secret:GMCP_CLIENT_ID}}",
          clientSecret: "{{secret:GMCP_CLIENT_SECRET}}",
        },
      },
    })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.status, "pending")
    assert.deepEqual(created.json.oauthClient, {
      clientId: "{{secret:GMCP_CLIENT_ID}}",
      clientSecretRef: "{{secret:GMCP_CLIENT_SECRET}}",
      hasSecret: true,
    })

    // Secrets referenced by the static OAuth client show the MCP connection in usedBy.
    const secrets = await call("/api/admin/secrets", { admin: true })
    const cidSecret = secrets.json.find((s) => s.name === "GMCP_CLIENT_ID")
    assert.ok(cidSecret.usedBy.includes(created.json.id))

    // PATCH with a raw secret never exposes the secret value back to the panel.
    const patched = await call(`/api/admin/connections/${created.json.id}`, {
      method: "PATCH",
      admin: true,
      body: {
        oauthClient: {
          clientId: "raw-cid",
          clientSecret: "raw-secret-value",
        },
      },
    })
    assert.equal(patched.status, 200, patched.text)
    assert.deepEqual(patched.json.oauthClient, {
      clientId: "raw-cid",
      clientSecretRef: null,
      hasSecret: true,
    })
    assert.ok(!patched.text.includes("raw-secret-value"))

    // Clearing the static OAuth client returns oauthClient: null.
    const cleared = await call(`/api/admin/connections/${created.json.id}`, {
      method: "PATCH",
      admin: true,
      body: { oauthClient: null },
    })
    assert.equal(cleared.status, 200, cleared.text)
    assert.equal(cleared.json.oauthClient, null)

    await call(`/api/admin/connections/${created.json.id}`, {
      method: "DELETE",
      admin: true,
    })
  })

  test("versioned skills over MCP (io.modelcontextprotocol/skills): list, get, read, directory, rollback and scopes", async () => {
    const projectId = "prj-default"
    const sha256 = (text) =>
      `sha256:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`

    // Create skill at v1.0 with a supporting reference file.
    const created = await call("/api/admin/skills", {
      method: "POST",
      admin: true,
      body: {
        projectId,
        slug: "refund-policy",
        version: "1.0",
        description: "Process customer refund requests",
        body: "# Refunds\n\nFollow `references/rules.md`.",
        files: [
          {
            path: "references/rules.md",
            content: "# Rules v1\n\nUp to 30 days.\n",
          },
        ],
      },
    })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.activeVersion, "1.0")
    assert.equal(created.json.versionCount, 1)
    const skillId = created.json.id

    // Minor bump -> 1.1 with updated body and an extra template file.
    const v11 = await call(`/api/admin/skills/${skillId}/versions`, {
      method: "POST",
      admin: true,
      body: {
        bump: "minor",
        description: "Process customer refund requests with templates",
        body: "# Refunds\n\nFollow `references/rules.md` and `templates/reply.md`.",
        changelog: "Added reply template",
        files: [
          {
            path: "references/rules.md",
            content: "# Rules v1.1\n\nUp to 30 days with receipt.\n",
          },
          {
            path: "templates/reply.md",
            content: "Hello,\n\nYour refund is approved.\n",
          },
        ],
      },
    })
    assert.equal(v11.status, 201, v11.text)
    assert.equal(v11.json.activeVersion, "1.1")
    assert.equal(v11.json.versionCount, 2)

    // Major bump -> 2.0 (inactive draft first, active stays 1.1).
    const v20 = await call(`/api/admin/skills/${skillId}/versions`, {
      method: "POST",
      admin: true,
      body: {
        bump: "major",
        description: "Automated refund workflow v2",
        body: "# Refunds v2\n\nFully automated.",
        activate: false,
      },
    })
    assert.equal(v20.status, 201, v20.text)
    assert.equal(v20.json.activeVersion, "1.1")
    assert.equal(v20.json.latestVersion, "2.0")
    assert.equal(v20.json.versionCount, 3)

    // Create a project token and verify MCP capability negotiation + skills/* methods.
    const tok = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: { name: "skills-test", target: { kind: "project", id: projectId } },
    })
    assert.equal(tok.status, 201, tok.text)
    const token = tok.json.key

    const init = await mcp(token, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    })
    assert.ok(init.result.capabilities.resources, JSON.stringify(init))
    assert.deepEqual(
      init.result.capabilities.extensions?.["io.modelcontextprotocol/skills"],
      { directoryRead: true }
    )

    // skills/list returns active version (1.1) with complete manifest & digests.
    const listed = await mcp(token, "skills/list")
    assert.equal(listed.result.resultType, "complete")
    assert.equal(listed.result.cacheScope, "private")
    assert.equal(listed.result.skills.length, 1)
    const entry = listed.result.skills[0]
    assert.equal(entry.uri, "skill://refund-policy/SKILL.md")
    assert.equal(entry.frontmatter.name, "refund-policy")
    assert.equal(entry.frontmatter.metadata.version, "1.1")
    assert.equal(entry.resources.length, 3)

    // resources/read bytes match the declared SHA-256 digest and byte size.
    const readMd = await mcp(token, "resources/read", {
      uri: "skill://refund-policy/SKILL.md",
    })
    const mdText = readMd.result.contents[0].text
    assert.equal(readMd.result.contents[0].mimeType, "text/markdown")
    const mdManifest = entry.resources.find(
      (r) => r.uri === "skill://refund-policy/SKILL.md"
    )
    assert.equal(sha256(mdText), mdManifest.digest)
    assert.equal(Buffer.byteLength(mdText, "utf8"), mdManifest.size)
    assert.match(mdText, /version: "1\.1"/)

    // Pinned historical version (v1.0) is directly retrievable via skills/get and resources/read.
    const pinnedGet = await mcp(token, "skills/get", {
      uri: "skill://v1.0/refund-policy/SKILL.md",
    })
    assert.equal(pinnedGet.result.resultType, "complete")
    assert.equal(pinnedGet.result.skill.frontmatter.metadata.version, "1.0")
    assert.equal(pinnedGet.result.skill.resources.length, 2)
    const pinnedRead = await mcp(token, "resources/read", {
      uri: "skill://v1.0/refund-policy/references/rules.md",
    })
    assert.equal(
      pinnedRead.result.contents[0].text,
      "# Rules v1\n\nUp to 30 days.\n"
    )

    // Unknown skill URI returns JSON-RPC -32602 (Invalid params).
    const unknown = await mcp(token, "skills/get", {
      uri: "skill://does-not-exist/SKILL.md",
    })
    assert.equal(unknown.error.code, -32602)

    // resources/directory/read lists root and subdirectories, rejects file URIs with -32602.
    const rootDir = await mcp(token, "resources/directory/read", {
      uri: "skill://refund-policy",
    })
    assert.equal(rootDir.result.resultType, "complete")
    assert.deepEqual(
      rootDir.result.resources.map((r) => [r.name, r.mimeType]),
      [
        ["references", "inode/directory"],
        ["SKILL.md", "text/markdown"],
        ["templates", "inode/directory"],
      ]
    )
    const subDir = await mcp(token, "resources/directory/read", {
      uri: "skill://refund-policy/templates",
    })
    assert.deepEqual(
      subDir.result.resources.map((r) => r.uri),
      ["skill://refund-policy/templates/reply.md"]
    )
    const notDir = await mcp(token, "resources/directory/read", {
      uri: "skill://refund-policy/SKILL.md",
    })
    assert.equal(notDir.error.code, -32602)

    // Rollback active version to 1.0 -> skills/list immediately reflects 1.0 & new digest.
    const rolled = await call(`/api/admin/skills/${skillId}/active`, {
      method: "PUT",
      admin: true,
      body: { version: "1.0" },
    })
    assert.equal(rolled.status, 200, rolled.text)
    assert.equal(rolled.json.activeVersion, "1.0")
    const afterRollback = await mcp(token, "skills/list")
    assert.equal(
      afterRollback.result.skills[0].frontmatter.metadata.version,
      "1.0"
    )
    assert.notEqual(
      afterRollback.result.skills[0].resources[0].digest,
      mdManifest.digest
    )

    // Scope isolation: a scope without the skill sees 0 skills; with it, sees 1.
    const emptyScope = await call("/api/admin/scopes", {
      method: "POST",
      admin: true,
      body: {
        orgId: "org-default",
        projectId,
        name: "No Skills",
        slug: "no-skills",
      },
    })
    assert.equal(emptyScope.status, 201, emptyScope.text)
    const scopeTok = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: {
        name: "scope-skills-test",
        target: { kind: "scope", id: emptyScope.json.id },
      },
    })
    const emptyList = await mcp(scopeTok.json.key, "skills/list")
    assert.equal(emptyList.result.skills.length, 0)

    await call(`/api/admin/scopes/${emptyScope.json.id}/connections`, {
      method: "PUT",
      admin: true,
      body: { connectionIds: [], secretIds: [], skillIds: [skillId] },
    })
    const grantedList = await mcp(scopeTok.json.key, "skills/list")
    assert.equal(grantedList.result.skills.length, 1)
    assert.equal(grantedList.result.skills[0].frontmatter.name, "refund-policy")

    // Tool-based access WITHOUT Code Mode (mode: "tools"): keyhall__list_skills & keyhall__get_skill.
    const toolNames = (await mcp(token, "tools/list")).result.tools.map(
      (t) => t.name
    )
    assert.ok(toolNames.includes("keyhall__list_skills"))
    assert.ok(toolNames.includes("keyhall__get_skill"))
    const listedViaTool = await mcp(token, "tools/call", {
      name: "keyhall__list_skills",
      arguments: {},
    })
    assert.ok(!listedViaTool.result.isError)
    const parsedSkillList = JSON.parse(listedViaTool.result.content[0].text)
    assert.equal(parsedSkillList.length, 1)
    assert.equal(parsedSkillList[0].slug, "refund-policy")
    assert.equal(parsedSkillList[0].version, "1.0")
    assert.deepEqual(parsedSkillList[0].files, ["references/rules.md"])

    const gotV11 = await mcp(token, "tools/call", {
      name: "keyhall__get_skill",
      arguments: { slug: "refund-policy", version: "1.1" },
    })
    assert.ok(!gotV11.result.isError)
    assert.match(gotV11.result.content[0].text, /version: "1\.1"/)

    const gotFile = await mcp(token, "tools/call", {
      name: "keyhall__get_skill",
      arguments: {
        slug: "refund-policy",
        version: "1.1",
        file: "templates/reply.md",
      },
    })
    assert.ok(!gotFile.result.isError)
    assert.equal(
      gotFile.result.content[0].text,
      "Hello,\n\nYour refund is approved.\n"
    )

    // Tool-based access WITH Code Mode (mode: "code"): search discovers skill tools and execute calls them.
    const codeTok = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: {
        name: "skills-code-mode",
        target: { kind: "project", id: projectId },
        mode: "code",
      },
    })
    assert.equal(codeTok.status, 201, codeTok.text)
    const codeTools = (await mcp(codeTok.json.key, "tools/list")).result.tools
    assert.deepEqual(
      codeTools.map((t) => t.name),
      ["search", "execute"]
    )
    assert.match(codeTools[0].description, /keyhall__list_skills/)

    const searchRes = await mcp(codeTok.json.key, "tools/call", {
      name: "search",
      arguments: { query: "skills" },
    })
    assert.match(searchRes.result.content[0].text, /keyhall__list_skills/)
    assert.match(searchRes.result.content[0].text, /keyhall__get_skill/)

    const execRes = await mcp(codeTok.json.key, "tools/call", {
      name: "execute",
      arguments: {
        code: `
          const skills = await call("keyhall__list_skills", {})
          const md = await call("keyhall__get_skill", { slug: skills[0].slug })
          const ref = await call("keyhall__get_skill", { slug: skills[0].slug, file: "references/rules.md" })
          return { slug: skills[0].slug, version: skills[0].version, hasVersion: md.includes('version: "1.0"'), ref }
        `,
      },
    })
    assert.ok(!execRes.result.isError, execRes.result.content[0].text)
    assert.deepEqual(JSON.parse(execRes.result.content[0].text), {
      slug: "refund-policy",
      version: "1.0",
      hasVersion: true,
      ref: "# Rules v1\n\nUp to 30 days.\n",
    })

    // Empty scope sees neither skill tool.
    const emptyScopeNoSkills = await call("/api/admin/scopes", {
      method: "POST",
      admin: true,
      body: {
        orgId: "org-default",
        projectId,
        name: "Really No Skills",
        slug: "really-no-skills",
      },
    })
    const emptyScopeTok = await call("/api/admin/tokens", {
      method: "POST",
      admin: true,
      body: {
        name: "really-no-skills-tok",
        target: { kind: "scope", id: emptyScopeNoSkills.json.id },
      },
    })
    const emptyToolNames = (
      await mcp(emptyScopeTok.json.key, "tools/list")
    ).result.tools.map((t) => t.name)
    assert.ok(!emptyToolNames.includes("keyhall__list_skills"))

    await call(`/api/admin/skills/${skillId}`, {
      method: "DELETE",
      admin: true,
    })
  })
})
