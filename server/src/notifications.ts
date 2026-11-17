import { createHmac, randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import { decrypt, encrypt } from "./crypto.js"
import { db } from "./db/index.js"
import { notificationChannel } from "./db/schema.js"
import { type AdminEnv, requireAdmin } from "./routes/middleware.js"

// Tells admins, outside the panel, that something waits for them: today, approval requests.
// Each channel is a service the admin already uses (Telegram, ntfy, Discord, Slack, or any
// webhook). Its fields are encrypted; secret ones never go back to the panel.

type Field = { name: string; secret?: boolean; optional?: boolean }

export const KINDS = {
  telegram: [{ name: "botToken", secret: true }, { name: "chatId" }],
  ntfy: [{ name: "url" }, { name: "token", secret: true, optional: true }],
  discord: [{ name: "webhookUrl", secret: true }],
  slack: [{ name: "webhookUrl", secret: true }],
  webhook: [{ name: "url" }, { name: "secret", secret: true, optional: true }],
} satisfies Record<string, Field[]>

export type Kind = keyof typeof KINDS
type Config = Record<string, string>
type Channel = typeof notificationChannel.$inferSelect

export type ApprovalEvent = {
  id: string
  tool: string
  exposedName: string
  connection: string
  tokenName: string
  requestedBy: string
  args: unknown
  expiresAt: Date
}

const panelUrl = () =>
  (process.env.BETTER_AUTH_URL ?? "http://localhost:8787").replace(/\/+$/, "")

const MAX_ARGS = 1500

function message(event: ApprovalEvent, includeArgs: boolean) {
  const lines = [
    `${event.tokenName} (${event.requestedBy}) wants to run ${event.exposedName} on ${event.connection}.`,
  ]
  if (includeArgs) {
    const args = JSON.stringify(event.args ?? {}, null, 2)
    lines.push(
      "",
      args.length > MAX_ARGS ? `${args.slice(0, MAX_ARGS)}\n…` : args
    )
  }
  lines.push("", `Approve or deny: ${panelUrl()}/#approvals`)
  return { title: "keyhall: approval needed", text: lines.join("\n") }
}

const TIMEOUT_MS = 10_000

async function post(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200)
    throw new Error(`${res.status} ${res.statusText} ${body}`.trim())
  }
}

const json = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

async function deliver(
  kind: Kind,
  config: Config,
  event: ApprovalEvent,
  includeArgs: boolean
) {
  const { title, text } = message(event, includeArgs)
  switch (kind) {
    case "telegram": {
      const api = process.env.KEYHALL_TELEGRAM_API ?? "https://api.telegram.org"
      return post(
        `${api}/bot${config.botToken}/sendMessage`,
        json({
          chat_id: config.chatId,
          text: `${title}\n\n${text}`,
          disable_web_page_preview: true,
        })
      )
    }
    case "ntfy":
      return post(config.url, {
        headers: {
          Title: title,
          Click: `${panelUrl()}/#approvals`,
          Tags: "lock",
          ...(config.token && { Authorization: `Bearer ${config.token}` }),
        },
        body: text,
      })
    case "discord":
      return post(config.webhookUrl, json({ content: `**${title}**\n${text}` }))
    case "slack":
      return post(config.webhookUrl, json({ text: `*${title}*\n${text}` }))
    case "webhook": {
      // A stable shape for your own automation; signed when a secret is set.
      const body = JSON.stringify({
        event: "approval.requested",
        approval: {
          id: event.id,
          tool: event.tool,
          name: event.exposedName,
          connection: event.connection,
          token: event.tokenName,
          requestedBy: event.requestedBy,
          expiresAt: event.expiresAt.toISOString(),
          ...(includeArgs && { args: event.args }),
        },
        url: `${panelUrl()}/#approvals`,
      })
      const headers: Record<string, string> = {
        "content-type": "application/json",
      }
      if (config.secret)
        headers["x-keyhall-signature"] =
          `sha256=${createHmac("sha256", config.secret).update(body).digest("hex")}`
      return post(config.url, { headers, body })
    }
  }
}

async function send(channel: Channel, event: ApprovalEvent) {
  try {
    await deliver(
      channel.kind,
      decrypt<Config>(channel.configEnc) ?? {},
      event,
      channel.includeArgs
    )
    await db
      .update(notificationChannel)
      .set({ lastSentAt: new Date(), lastError: null })
      .where(eq(notificationChannel.id, channel.id))
    return undefined
  } catch (err) {
    const error = (err as Error).message
    console.error(`notification ${channel.name} failed:`, error)
    await db
      .update(notificationChannel)
      .set({ lastError: error })
      .where(eq(notificationChannel.id, channel.id))
    return error
  }
}

// Fire and forget: a slow or broken channel never delays the agent's call.
export function notifyApproval(event: ApprovalEvent) {
  db.select()
    .from(notificationChannel)
    .where(eq(notificationChannel.enabled, true))
    .then((channels) =>
      Promise.allSettled(channels.map((ch) => send(ch, event)))
    )
    .catch((err) => console.error("notifications failed:", err))
}

// The panel sees which fields are set, never secret values.
function publicChannel(ch: Channel) {
  const config = decrypt<Config>(ch.configEnc) ?? {}
  const fields: Record<string, string> = {}
  for (const f of KINDS[ch.kind] as Field[])
    fields[f.name] = f.secret ? "" : (config[f.name] ?? "")
  return {
    id: ch.id,
    name: ch.name,
    kind: ch.kind,
    fields,
    secretsSet: (KINDS[ch.kind] as Field[])
      .filter((f) => f.secret && config[f.name])
      .map((f) => f.name),
    includeArgs: ch.includeArgs,
    enabled: ch.enabled,
    lastSentAt: ch.lastSentAt,
    lastError: ch.lastError,
  }
}

const httpUrl = z.url({ protocol: /^https?$/ })

// Checks a channel's fields; on edit, an empty secret keeps the stored one.
function configFor(kind: Kind, input: Config, previous: Config = {}) {
  const config: Config = {}
  for (const f of KINDS[kind] as Field[]) {
    const value = input[f.name]?.trim() || (f.secret ? previous[f.name] : "")
    if (!value) {
      if (f.optional) continue
      return { error: `${f.name} is required` }
    }
    if (/url$/i.test(f.name) && !httpUrl.safeParse(value).success)
      return { error: `${f.name} must be an http(s) URL` }
    config[f.name] = value
  }
  return { config }
}

const channelInput = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(Object.keys(KINDS) as [Kind, ...Kind[]]),
  fields: z.record(z.string(), z.string()).default({}),
  includeArgs: z.boolean().default(false),
  enabled: z.boolean().default(true),
})

const sample = (): ApprovalEvent => ({
  id: "test",
  tool: "send_message",
  exposedName: "gmail__send_message",
  connection: "Gmail",
  tokenName: "test",
  requestedBy: "keyhall",
  args: { to: "someone@example.com", subject: "Test from keyhall" },
  expiresAt: new Date(Date.now() + 15 * 60_000),
})

export const notifications = new Hono<AdminEnv>()
  .use(requireAdmin)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(notificationChannel)
      .orderBy(notificationChannel.createdAt)
    return c.json({ channels: rows.map(publicChannel), kinds: KINDS })
  })
  .post("/", async (c) => {
    const input = channelInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const { fields, ...data } = input.data
    const checked = configFor(data.kind, fields)
    if ("error" in checked) return c.json({ error: checked.error }, 400)
    const [row] = await db
      .insert(notificationChannel)
      .values({
        id: randomUUID(),
        ...data,
        configEnc: encrypt(checked.config),
      })
      .returning()
    return c.json(publicChannel(row), 201)
  })
  .patch("/:id", async (c) => {
    // No defaults here: only what's sent changes.
    const input = z
      .object({
        name: z.string().trim().min(1),
        fields: z.record(z.string(), z.string()),
        includeArgs: z.boolean(),
        enabled: z.boolean(),
      })
      .partial()
      .safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const [ch] = await db
      .select()
      .from(notificationChannel)
      .where(eq(notificationChannel.id, c.req.param("id")))
    if (!ch) return c.json({ error: "channel not found" }, 404)
    const { fields, ...data } = input.data
    let configEnc = ch.configEnc
    if (fields) {
      const checked = configFor(
        ch.kind,
        fields,
        decrypt<Config>(ch.configEnc) ?? {}
      )
      if ("error" in checked) return c.json({ error: checked.error }, 400)
      configEnc = encrypt(checked.config)
    }
    const [row] = await db
      .update(notificationChannel)
      .set({ ...data, configEnc })
      .where(eq(notificationChannel.id, ch.id))
      .returning()
    return c.json(publicChannel(row))
  })
  .delete("/:id", async (c) => {
    await db
      .delete(notificationChannel)
      .where(eq(notificationChannel.id, c.req.param("id")))
    return c.body(null, 204)
  })
  // Sends a sample request now and reports what the service answered.
  .post("/:id/test", async (c) => {
    const [ch] = await db
      .select()
      .from(notificationChannel)
      .where(eq(notificationChannel.id, c.req.param("id")))
    if (!ch) return c.json({ error: "channel not found" }, 404)
    const error = await send(ch, sample())
    return error ? c.json({ error }, 502) : c.body(null, 204)
  })
