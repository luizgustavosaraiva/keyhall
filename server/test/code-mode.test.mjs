// Code Mode's search ranking, against a catalog shaped like a real one.
import assert from "node:assert/strict"
import { test } from "node:test"
import { callCodeMode } from "../dist/mcp/code-mode.js"

const tool = (name, description = "") => ({
  name,
  description,
  inputSchema: { type: "object" },
})
const ctx = {
  catalog: async () => [
    tool("dokploy__backup-listBackupFiles", "GET /backup.listBackupFiles"),
    tool("dokploy__deployment-queueList", "GET /deployment.queueList"),
    tool("dokploy__project-all", "GET /project.all"),
    tool("dokploy__project-one", "GET /project.one"),
    tool("dokploy__application-deploy", "POST /application.deploy"),
    tool("dokploy__dnsProvider-listRecords", "GET /dnsProvider.listRecords"),
    tool("cloudflare__whoami", "Return the Cloudflare user or account"),
    tool("resend__list-domains", "List all domains"),
  ],
  call: async () => ({ content: [] }),
  connections: [
    { prefix: "dokploy__", name: "Dokploy" },
    { prefix: "cloudflare__", name: "Cloudflare" },
    { prefix: "resend__", name: "Resend" },
  ],
  secrets: false,
}

const names = async (query) =>
  (await callCodeMode(ctx, "search", { query })).content[0].text
    .split("\n")
    .filter((l) => /^\w+__/.test(l))

test("plural words and list/all find the right tool first", async () => {
  assert.equal(
    (await names("list dokploy projects"))[0],
    "dokploy__project-all"
  )
})

test("a connection name narrows the search to it", async () => {
  const found = await names("dokploy list")
  assert.ok(
    found.every((n) => n.startsWith("dokploy__")),
    found.join(", ")
  )
  assert.ok(!found.includes("resend__list-domains"))
})

test("camelCase names split into words", async () => {
  assert.equal(
    (await names("dns records"))[0],
    "dokploy__dnsProvider-listRecords"
  )
})

test("a connection alone lists its tools", async () => {
  assert.deepEqual(await names("cloudflare"), ["cloudflare__whoami"])
  assert.equal((await names("dokploy__")).length, 6)
})

test("deploy finds the deploy tool", async () => {
  assert.equal(
    (await names("deploy application"))[0],
    "dokploy__application-deploy"
  )
})
