import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { NativeContext, NativePlugin, NativeTool } from "./types.js"

type Args = Record<string, unknown>

// KEYHALL_GOOGLE_BASE points every Google endpoint at one server (tests use a fake one).
const testBase = process.env.KEYHALL_GOOGLE_BASE?.replace(/\/$/, "")
const endpoints = {
  authorize: testBase
    ? `${testBase}/o/oauth2/v2/auth`
    : "https://accounts.google.com/o/oauth2/v2/auth",
  token: testBase ? `${testBase}/token` : "https://oauth2.googleapis.com/token",
  userinfo: testBase
    ? `${testBase}/userinfo`
    : "https://openidconnect.googleapis.com/v1/userinfo",
  gmail: testBase ? `${testBase}/gmail` : "https://gmail.googleapis.com",
  drive: testBase ? `${testBase}/drive` : "https://www.googleapis.com",
  sheets: testBase ? `${testBase}/sheets` : "https://sheets.googleapis.com",
}

// File and message bodies are cut here so one call doesn't flood the model's context.
const MAX_TEXT = 100_000

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v))
const list = (v: unknown) =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : []
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.trunc(n)))
    : fallback
}
const cut = (text: string) =>
  text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n\n[cut: ${text.length - MAX_TEXT} more characters]`
    : text
const enc = encodeURIComponent

const READ = { readOnlyHint: true, openWorldHint: true }
const WRITE = { readOnlyHint: false, openWorldHint: true }

const schema = (
  properties: Record<string, object>,
  required: string[] = []
): Tool["inputSchema"] => ({ type: "object", properties, required })

// ---- Gmail ----

const gmail = (path: string) => `${endpoints.gmail}/gmail/v1/users/me${path}`

type GmailPart = {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailPart[]
}
type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart
}

const header = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value ?? ""

const fromBase64Url = (data: string) =>
  Buffer.from(data, "base64url").toString("utf8")

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
}

// Removes <tag ...>...</tag> blocks (their content is code, not text). An unclosed block
// runs to the end.
function dropBlocks(html: string, tag: string) {
  const lower = html.toLowerCase()
  let out = ""
  let at = 0
  for (;;) {
    const start = lower.indexOf(`<${tag}`, at)
    if (start === -1) return out + html.slice(at)
    out += html.slice(at, start)
    const close = lower.indexOf(`</${tag}`, start)
    if (close === -1) return out
    const end = lower.indexOf(">", close)
    if (end === -1) return out
    at = end + 1
  }
}

// Plain text of an HTML body, for the model (never rendered as HTML). Entities are decoded
// in one pass first, then tags are removed until none is left, so decoding can't bring a
// tag back and nothing is unescaped twice.
function stripHtml(html: string) {
  let text = html.replace(
    /&(nbsp|amp|lt|gt|quot|#39);/g,
    (_, name: string) => ENTITIES[name] ?? ""
  )
  text = dropBlocks(dropBlocks(text, "script"), "style")
  text = text.replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
  let previous: string
  do {
    previous = text
    text = text.replace(/<[^<>]*>/g, "")
  } while (text !== previous)
  return text
    .replace(/[<>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Plain text of a message: the text/plain part, or the HTML one without tags.
function bodyOf(part: GmailPart | undefined): { plain: string; html: string } {
  const out = { plain: "", html: "" }
  const walk = (p?: GmailPart) => {
    if (!p) return
    if (!p.filename && p.body?.data) {
      if (p.mimeType === "text/plain") out.plain += fromBase64Url(p.body.data)
      else if (p.mimeType === "text/html")
        out.html += fromBase64Url(p.body.data)
    }
    for (const child of p.parts ?? []) walk(child)
  }
  walk(part)
  return out
}

function attachmentsOf(part: GmailPart | undefined) {
  const found: { filename: string; mimeType?: string; size?: number }[] = []
  const walk = (p?: GmailPart) => {
    if (!p) return
    if (p.filename)
      found.push({
        filename: p.filename,
        mimeType: p.mimeType,
        size: p.body?.size,
      })
    for (const child of p.parts ?? []) walk(child)
  }
  walk(part)
  return found
}

const summary = (m: GmailMessage) => ({
  id: m.id,
  threadId: m.threadId,
  date: header(m.payload, "Date"),
  from: header(m.payload, "From"),
  to: header(m.payload, "To"),
  subject: header(m.payload, "Subject"),
  snippet: m.snippet,
  labels: m.labelIds,
})

function readable(m: GmailMessage) {
  const { plain, html } = bodyOf(m.payload)
  return {
    ...summary(m),
    cc: header(m.payload, "Cc") || undefined,
    body: cut(plain.trim() || stripHtml(html)),
    attachments: attachmentsOf(m.payload),
  }
}

// RFC 2047 for non-ASCII header values (subject, names).
const mimeWord = (value: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
  /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`

const noBreak = (v: string) => v.replace(/[\r\n]+/g, " ").trim()

type Draft = { raw: string; threadId?: string }

async function composeMessage(ctx: NativeContext, args: Args): Promise<Draft> {
  const to = list(args.to)
  const cc = list(args.cc)
  const bcc = list(args.bcc)
  let subject = str(args.subject)
  let threadId: string | undefined
  const extra: string[] = []
  const replyTo = str(args.replyToMessageId)
  if (replyTo) {
    const original = await ctx.json<GmailMessage>(
      gmail(
        `/messages/${enc(replyTo)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Reply-To`
      )
    )
    threadId = original.threadId
    const messageId = header(original.payload, "Message-ID")
    if (messageId) {
      extra.push(`In-Reply-To: ${messageId}`)
      extra.push(
        `References: ${[header(original.payload, "References"), messageId].filter(Boolean).join(" ")}`
      )
    }
    if (!subject) {
      const s = header(original.payload, "Subject")
      subject = /^re:/i.test(s) ? s : `Re: ${s}`
    }
    if (!to.length)
      to.push(
        header(original.payload, "Reply-To") || header(original.payload, "From")
      )
  }
  if (!to.length) throw new Error("to is required")
  const lines = [
    `To: ${noBreak(to.join(", "))}`,
    ...(cc.length ? [`Cc: ${noBreak(cc.join(", "))}`] : []),
    ...(bcc.length ? [`Bcc: ${noBreak(bcc.join(", "))}`] : []),
    `Subject: ${mimeWord(noBreak(subject))}`,
    ...extra,
    "MIME-Version: 1.0",
    `Content-Type: ${args.html ? "text/html" : "text/plain"}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(str(args.body), "utf8")
      .toString("base64")
      .replace(/.{76}/g, "$&\r\n"),
  ]
  return {
    raw: Buffer.from(lines.join("\r\n"), "utf8").toString("base64url"),
    threadId,
  }
}

const composeProps = {
  to: {
    type: "array",
    items: { type: "string" },
    description:
      'Recipients ("Name <a@b.com>" or a@b.com). Optional when replying: defaults to the sender of the original.',
  },
  cc: { type: "array", items: { type: "string" } },
  bcc: { type: "array", items: { type: "string" } },
  subject: {
    type: "string",
    description:
      'Optional when replying: defaults to "Re: <original subject>".',
  },
  body: { type: "string", description: "Message body" },
  html: {
    type: "boolean",
    description: "true when body is HTML; plain text otherwise",
  },
  replyToMessageId: {
    type: "string",
    description:
      "Gmail message id to reply to: keeps the thread and sets In-Reply-To.",
  },
}

const gmailTools: NativeTool[] = [
  {
    feature: "gmail",
    tool: {
      name: "gmail_search",
      description:
        "Search Gmail messages with Gmail search syntax (from:, to:, subject:, is:unread, newer_than:7d, has:attachment, label:...). Returns id, thread, date, from, subject and snippet; use gmail_read_message for the body.",
      inputSchema: schema(
        {
          query: { type: "string", description: "Gmail search query" },
          maxResults: {
            type: "integer",
            description: "1 to 50, default 10",
          },
        },
        ["query"]
      ),
      annotations: READ,
    },
    run: async (ctx, args) => {
      const max = clampInt(args.maxResults, 1, 50, 10)
      const res = await ctx.json<{ messages?: { id: string }[] }>(
        gmail(`/messages?q=${enc(str(args.query))}&maxResults=${max}`)
      )
      const ids = (res.messages ?? []).map((m) => m.id)
      const messages = await Promise.all(
        ids.map((id) =>
          ctx.json<GmailMessage>(
            gmail(
              `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
            )
          )
        )
      )
      return messages.map(summary)
    },
  },
  {
    feature: "gmail",
    tool: {
      name: "gmail_read_message",
      description:
        "Read one Gmail message: headers, plain-text body and attachment names.",
      inputSchema: schema({ id: { type: "string" } }, ["id"]),
      annotations: READ,
    },
    run: async (ctx, args) =>
      readable(
        await ctx.json<GmailMessage>(
          gmail(`/messages/${enc(str(args.id))}?format=full`)
        )
      ),
  },
  {
    feature: "gmail",
    tool: {
      name: "gmail_read_thread",
      description: "Read every message of a Gmail thread, oldest first.",
      inputSchema: schema({ threadId: { type: "string" } }, ["threadId"]),
      annotations: READ,
    },
    run: async (ctx, args) => {
      const thread = await ctx.json<{ messages?: GmailMessage[] }>(
        gmail(`/threads/${enc(str(args.threadId))}?format=full`)
      )
      return (thread.messages ?? []).map(readable)
    },
  },
  {
    feature: "gmail",
    tool: {
      name: "gmail_create_draft",
      description:
        "Create a Gmail draft (not sent). Use replyToMessageId to draft a reply in the same thread.",
      inputSchema: schema(composeProps),
      annotations: WRITE,
    },
    run: async (ctx, args) => {
      const message = await composeMessage(ctx, args)
      const draft = await ctx.json<{ id: string; message: GmailMessage }>(
        gmail("/drafts"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        }
      )
      return {
        draftId: draft.id,
        messageId: draft.message.id,
        threadId: draft.message.threadId,
      }
    },
  },
  {
    feature: "gmail",
    tool: {
      name: "gmail_send",
      description:
        "Send an email from the connected Gmail account. Use replyToMessageId to reply in the same thread.",
      inputSchema: schema(composeProps, ["body"]),
      annotations: { ...WRITE, destructiveHint: true },
    },
    run: async (ctx, args) => {
      const message = await composeMessage(ctx, args)
      const sent = await ctx.json<GmailMessage>(gmail("/messages/send"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      })
      return { id: sent.id, threadId: sent.threadId, labels: sent.labelIds }
    },
  },
  {
    feature: "gmail",
    tool: {
      name: "gmail_list_labels",
      description:
        "List Gmail labels (system ones such as INBOX, UNREAD, STARRED and the user's own) with their ids.",
      inputSchema: schema({}),
      annotations: READ,
    },
    run: async (ctx) => {
      const res = await ctx.json<{
        labels?: { id: string; name: string; type: string }[]
      }>(gmail("/labels"))
      return (res.labels ?? []).map(({ id, name, type }) => ({
        id,
        name,
        type,
      }))
    },
  },
  {
    feature: "gmail",
    tool: {
      name: "gmail_modify_labels",
      description:
        "Add or remove labels on a message, by label id. Examples: remove UNREAD to mark as read, remove INBOX to archive, add STARRED, add TRASH to move to trash.",
      inputSchema: schema(
        {
          id: { type: "string", description: "Message id" },
          add: { type: "array", items: { type: "string" } },
          remove: { type: "array", items: { type: "string" } },
        },
        ["id"]
      ),
      annotations: WRITE,
    },
    run: async (ctx, args) => {
      const m = await ctx.json<GmailMessage>(
        gmail(`/messages/${enc(str(args.id))}/modify`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            addLabelIds: list(args.add),
            removeLabelIds: list(args.remove),
          }),
        }
      )
      return { id: m.id, labels: m.labelIds }
    },
  },
]

// ---- Drive ----

const drive = (path: string) => `${endpoints.drive}/drive/v3${path}`
const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,size,webViewLink,parents,owners(emailAddress)"

// Google files are exported to text; other text-like files are downloaded as they are.
const EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
}
const isText = (mime: string) =>
  mime.startsWith("text/") || /json|xml|javascript|yaml|csv|x-sh|sql/.test(mime)

const quoted = (v: string) =>
  `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`

type DriveFile = { id: string; name: string; mimeType: string; size?: string }

async function upload(
  ctx: NativeContext,
  method: "POST" | "PATCH",
  path: string,
  metadata: object,
  content: string,
  contentType: string
) {
  const boundary = `keyhall${Date.now().toString(36)}`
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n")
  return ctx.json<DriveFile & { webViewLink?: string }>(
    `${endpoints.drive}/upload/drive/v3/files${path}?uploadType=multipart&fields=${enc(FILE_FIELDS)}`,
    {
      method,
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    }
  )
}

const driveTools: NativeTool[] = [
  {
    feature: "drive",
    tool: {
      name: "drive_search",
      description:
        "Search Google Drive files (trashed files excluded), newest first. text searches names and content; q takes raw Drive query syntax (e.g. \"mimeType = 'application/vnd.google-apps.folder'\" or \"'<folderId>' in parents\").",
      inputSchema: schema({
        text: { type: "string", description: "Words in the name or content" },
        q: {
          type: "string",
          description: "Raw Drive query, combined with AND",
        },
        maxResults: { type: "integer", description: "1 to 100, default 20" },
      }),
      annotations: READ,
    },
    run: async (ctx, args) => {
      const parts = ["trashed = false"]
      if (args.text) parts.push(`fullText contains ${quoted(str(args.text))}`)
      if (args.q) parts.push(`(${str(args.q)})`)
      const max = clampInt(args.maxResults, 1, 100, 20)
      const res = await ctx.json<{ files?: unknown[] }>(
        drive(
          `/files?q=${enc(parts.join(" and "))}&pageSize=${max}&orderBy=${enc("modifiedTime desc")}&fields=${enc(`files(${FILE_FIELDS})`)}&supportsAllDrives=true&includeItemsFromAllDrives=true`
        )
      )
      return res.files ?? []
    },
  },
  {
    feature: "drive",
    tool: {
      name: "drive_read_file",
      description:
        "Read a Drive file as text: Google Docs and Slides as plain text, Google Sheets as CSV (first sheet; use sheets_read for others), text files as they are. Binary files return only their metadata.",
      inputSchema: schema({ fileId: { type: "string" } }, ["fileId"]),
      annotations: READ,
    },
    run: async (ctx, args) => {
      const id = enc(str(args.fileId))
      const meta = await ctx.json<DriveFile>(
        drive(`/files/${id}?fields=${enc(FILE_FIELDS)}&supportsAllDrives=true`)
      )
      const exportAs = EXPORTS[meta.mimeType]
      const url = exportAs
        ? drive(`/files/${id}/export?mimeType=${enc(exportAs)}`)
        : isText(meta.mimeType)
          ? drive(`/files/${id}?alt=media&supportsAllDrives=true`)
          : undefined
      if (!url)
        return {
          ...meta,
          content: null,
          note: "binary file: content not returned",
        }
      const text = await (await ctx.fetch(url)).text()
      return { ...meta, content: cut(text) }
    },
  },
  {
    feature: "drive",
    tool: {
      name: "drive_create_file",
      description:
        "Create a text file in Drive. asGoogleDoc converts it into a Google Doc. Returns the id and link.",
      inputSchema: schema(
        {
          name: { type: "string" },
          content: { type: "string" },
          contentType: {
            type: "string",
            description: "MIME type of content, default text/plain",
          },
          folderId: { type: "string", description: "Parent folder id" },
          asGoogleDoc: { type: "boolean" },
        },
        ["name", "content"]
      ),
      annotations: WRITE,
    },
    run: (ctx, args) =>
      upload(
        ctx,
        "POST",
        "",
        {
          name: str(args.name),
          ...(args.folderId ? { parents: [str(args.folderId)] } : {}),
          ...(args.asGoogleDoc
            ? { mimeType: "application/vnd.google-apps.document" }
            : {}),
        },
        str(args.content),
        str(args.contentType) || "text/plain"
      ),
  },
  {
    feature: "drive",
    tool: {
      name: "drive_update_file",
      description:
        "Replace the content of a Drive file that keyhall created (other files are read-only to keyhall).",
      inputSchema: schema(
        {
          fileId: { type: "string" },
          content: { type: "string" },
          contentType: { type: "string", description: "default text/plain" },
        },
        ["fileId", "content"]
      ),
      annotations: { ...WRITE, destructiveHint: true },
    },
    run: (ctx, args) =>
      upload(
        ctx,
        "PATCH",
        `/${enc(str(args.fileId))}`,
        {},
        str(args.content),
        str(args.contentType) || "text/plain"
      ),
  },
]

// ---- Sheets ----

const sheets = (path: string) => `${endpoints.sheets}/v4/spreadsheets${path}`

const valuesSchema = {
  type: "array",
  items: { type: "array", items: {} },
  description:
    'Rows of cells, e.g. [["Name","Total"],["Ana",10]]. Formulas start with "=".',
}

const sheetsTools: NativeTool[] = [
  {
    feature: "sheets",
    tool: {
      name: "sheets_get",
      description: "Title and tabs (name, id, rows, columns) of a spreadsheet.",
      inputSchema: schema({ spreadsheetId: { type: "string" } }, [
        "spreadsheetId",
      ]),
      annotations: READ,
    },
    run: async (ctx, args) =>
      ctx.json(
        sheets(
          `/${enc(str(args.spreadsheetId))}?fields=${enc("spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))")}`
        )
      ),
  },
  {
    feature: "sheets",
    tool: {
      name: "sheets_read",
      description:
        'Read cell values in A1 notation (e.g. "Sheet1!A1:D20" or just "Sheet1"), as shown in the sheet.',
      inputSchema: schema(
        {
          spreadsheetId: { type: "string" },
          range: { type: "string" },
          formulas: {
            type: "boolean",
            description: "Return formulas instead of their results",
          },
        },
        ["spreadsheetId", "range"]
      ),
      annotations: READ,
    },
    run: async (ctx, args) =>
      ctx.json(
        sheets(
          `/${enc(str(args.spreadsheetId))}/values/${enc(str(args.range))}?valueRenderOption=${args.formulas ? "FORMULA" : "FORMATTED_VALUE"}`
        )
      ),
  },
  {
    feature: "sheets",
    tool: {
      name: "sheets_write",
      description:
        "Write values starting at a range in A1 notation, overwriting what is there. Values are parsed as if typed (numbers, dates, formulas).",
      inputSchema: schema(
        {
          spreadsheetId: { type: "string" },
          range: { type: "string" },
          values: valuesSchema,
        },
        ["spreadsheetId", "range", "values"]
      ),
      annotations: { ...WRITE, destructiveHint: true },
    },
    run: async (ctx, args) =>
      ctx.json(
        sheets(
          `/${enc(str(args.spreadsheetId))}/values/${enc(str(args.range))}?valueInputOption=USER_ENTERED`
        ),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: args.values }),
        }
      ),
  },
  {
    feature: "sheets",
    tool: {
      name: "sheets_append",
      description:
        'Append rows after the last row with data of a table (range like "Sheet1!A:D").',
      inputSchema: schema(
        {
          spreadsheetId: { type: "string" },
          range: { type: "string" },
          values: valuesSchema,
        },
        ["spreadsheetId", "range", "values"]
      ),
      annotations: WRITE,
    },
    run: async (ctx, args) =>
      ctx.json(
        sheets(
          `/${enc(str(args.spreadsheetId))}/values/${enc(str(args.range))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
        ),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: args.values }),
        }
      ),
  },
  {
    feature: "sheets",
    tool: {
      name: "sheets_clear",
      description: "Clear the values of a range (formatting stays).",
      inputSchema: schema(
        { spreadsheetId: { type: "string" }, range: { type: "string" } },
        ["spreadsheetId", "range"]
      ),
      annotations: { ...WRITE, destructiveHint: true },
    },
    run: async (ctx, args) =>
      ctx.json(
        sheets(
          `/${enc(str(args.spreadsheetId))}/values/${enc(str(args.range))}:clear`
        ),
        { method: "POST" }
      ),
  },
  {
    feature: "sheets",
    tool: {
      name: "sheets_create",
      description:
        "Create a spreadsheet. Optional tab names; returns its id and URL.",
      inputSchema: schema(
        {
          title: { type: "string" },
          tabs: { type: "array", items: { type: "string" } },
        },
        ["title"]
      ),
      annotations: WRITE,
    },
    run: async (ctx, args) => {
      const tabs = list(args.tabs)
      const created = await ctx.json<{
        spreadsheetId: string
        spreadsheetUrl: string
      }>(sheets(""), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          properties: { title: str(args.title) },
          ...(tabs.length
            ? { sheets: tabs.map((title) => ({ properties: { title } })) }
            : {}),
        }),
      })
      return {
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl,
      }
    },
  },
  {
    feature: "sheets",
    tool: {
      name: "sheets_add_tab",
      description: "Add a tab to a spreadsheet.",
      inputSchema: schema(
        { spreadsheetId: { type: "string" }, title: { type: "string" } },
        ["spreadsheetId", "title"]
      ),
      annotations: WRITE,
    },
    run: async (ctx, args) =>
      ctx.json(sheets(`/${enc(str(args.spreadsheetId))}:batchUpdate`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: str(args.title) } } }],
        }),
      }),
  },
]

// Least scopes that cover each feature's tools. drive.readonly reads every file; drive.file
// writes only files keyhall created, so existing files can't be overwritten through it.
const SCOPES: Record<string, string[]> = {
  gmail: ["https://www.googleapis.com/auth/gmail.modify"],
  drive: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
}

// Gmail, Drive and Sheets over Google's REST APIs, with the admin's own OAuth client. Google's
// MCP servers need a Workspace account in the Developer Preview, so personal accounts go here.
export const google: NativePlugin = {
  id: "google",
  vaultName: "GOOGLE",
  consoleUrl: "https://console.cloud.google.com/apis/credentials",
  fields: [
    {
      name: "clientId",
      label: { en: "OAuth client ID", pt: "ID do cliente OAuth" },
      placeholder: "1234…apps.googleusercontent.com",
      vault: "CLIENT_ID",
    },
    {
      name: "clientSecret",
      label: {
        en: "OAuth client secret",
        pt: "Chave secreta do cliente OAuth",
      },
      secret: true,
      vault: "CLIENT_SECRET",
    },
  ],
  features: [
    {
      id: "gmail",
      label: { en: "Gmail", pt: "Gmail" },
      hint: {
        en: "read, search, drafts, send, labels",
        pt: "ler, buscar, rascunhos, enviar, marcadores",
      },
    },
    {
      id: "drive",
      label: { en: "Google Drive", pt: "Google Drive" },
      hint: {
        en: "search and read files, create text files",
        pt: "buscar e ler arquivos, criar arquivos de texto",
      },
    },
    {
      id: "sheets",
      label: { en: "Google Sheets", pt: "Google Planilhas" },
      hint: {
        en: "read and write spreadsheets",
        pt: "ler e escrever planilhas",
      },
    },
  ],
  oauth: (values, features) => ({
    authorizeUrl: endpoints.authorize,
    tokenUrl: endpoints.token,
    clientId: values.clientId ?? "",
    clientSecret: values.clientSecret ?? "",
    scopes: [
      "openid",
      "email",
      ...new Set(features.flatMap((f) => SCOPES[f] ?? [])),
    ],
    // A refresh token every time, also when the account already granted access before.
    params: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    accountUrl: endpoints.userinfo,
    accountField: "email",
  }),
  tools: [...gmailTools, ...driveTools, ...sheetsTools],
}
