// End-to-end tests: start the built server (dist/) on a temporary database and exercise the
// public surface the way a consumer and the panel do. Run with `pnpm test` after `pnpm build`.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer, request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"
import { fileURLToPath } from "node:url"

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
    },
  })
  proc.stdout.on("data", (d) => (log += d))
  proc.stderr.on("data", (d) => (log += d))
  await waitFor(() => log.includes("listening"), "the server to start")
})

after(() => {
  proc?.kill()
  upstream.close()
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
    assert.deepEqual((await call("/api/setup")).json, { needed: true })
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
    assert.equal((await mcp("kh_invalid", "tools/list")).status, 403)
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
    assert.equal((await mcp(tokens.scope, "tools/list")).status, 403)
  })
})
