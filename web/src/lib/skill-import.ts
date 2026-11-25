import type { SkillFile } from "./api"
import { slugify } from "./slug"

export type ParsedSkillMd = {
  name?: string
  description?: string
  version?: string
  body: string
  frontmatterExtra: Record<string, unknown> | null
}

export type ImportedSkill = ParsedSkillMd & {
  files: SkillFile[]
  skippedBinary: string[]
  sourceName?: string
}

// Parses a YAML scalar (bare, single/double-quoted, boolean, number, inline array).
function parseYamlScalar(raw: string): unknown {
  const s = raw.trim()
  if (!s) return ""
  if (s === "true") return true
  if (s === "false") return false
  if (s === "null" || s === "~") return null
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s)
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("[") && s.endsWith("]")) ||
    (s.startsWith("{") && s.endsWith("}"))
  ) {
    try {
      return JSON.parse(s)
    } catch {
      if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
    }
  }
  if (s.startsWith("'") && s.endsWith("'"))
    return s.slice(1, -1).replace(/''/g, "'")
  return s
}

// Lightweight YAML frontmatter parser tailored for Agent Skills SKILL.md headers:
// handles scalar keys, multi-line block scalars (>, |, >-, |-), string lists and nested maps.
function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const root: Record<string, unknown> = {}
  let i = 0

  const indentOf = (line: string) => line.length - line.trimStart().length

  function readBlockScalar(
    baseIndent: number,
    style: string
  ): { value: string; next: number } {
    const folded = style.startsWith(">")
    const chompStrip = style.endsWith("-")
    const block: string[] = []
    let blockIndent: number | null = null
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j] ?? ""
      if (line.trim() === "") {
        block.push("")
        j++
        continue
      }
      const ind = indentOf(line)
      if (ind <= baseIndent) break
      if (blockIndent === null) blockIndent = ind
      block.push(line.slice(Math.min(blockIndent, ind)))
      j++
    }
    while (block.length && block[block.length - 1] === "") block.pop()
    const joined = folded
      ? block
          .join("\n")
          .replace(/([^\n])\n([^\n])/g, "$1 $2")
          .replace(/\n{2,}/g, "\n")
      : block.join("\n")
    return { value: chompStrip ? joined.trimEnd() : joined, next: j }
  }

  function parseMap(minIndent: number): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    while (i < lines.length) {
      const line = lines[i] ?? ""
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) {
        i++
        continue
      }
      const ind = indentOf(line)
      if (ind < minIndent) break
      const colon = trimmed.indexOf(":")
      if (colon === -1) {
        i++
        continue
      }
      const key = trimmed
        .slice(0, colon)
        .trim()
        .replace(/^["']|["']$/g, "")
      const rest = trimmed.slice(colon + 1).trim()
      if (rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
        const { value, next } = readBlockScalar(ind, rest)
        out[key] = value
        i = next
        continue
      }
      if (rest !== "") {
        out[key] = parseYamlScalar(rest)
        i++
        continue
      }
      // Nested block (map or sequence)
      i++
      while (
        i < lines.length &&
        (!(lines[i] ?? "").trim() || (lines[i] ?? "").trim().startsWith("#"))
      )
        i++
      if (i >= lines.length || indentOf(lines[i] ?? "") <= ind) {
        out[key] = ""
        continue
      }
      const childIndent = indentOf(lines[i] ?? "")
      if ((lines[i] ?? "").trim().startsWith("- ")) {
        const arr: unknown[] = []
        while (i < lines.length) {
          const cur = lines[i] ?? ""
          if (!cur.trim() || cur.trim().startsWith("#")) {
            i++
            continue
          }
          if (indentOf(cur) < childIndent) break
          if (!cur.trim().startsWith("- ")) break
          arr.push(parseYamlScalar(cur.trim().slice(2)))
          i++
        }
        out[key] = arr
      } else {
        out[key] = parseMap(childIndent)
      }
    }
    return out
  }

  Object.assign(root, parseMap(0))
  return root
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/

export function parseSkillMd(raw: string): ParsedSkillMd {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/)
  if (!match) {
    return {
      body: normalized.trim(),
      frontmatterExtra: null,
    }
  }
  const fm = parseSimpleYaml(match[1] ?? "")
  const body = (match[2] ?? "").replace(/^\n+/, "").trimEnd()

  const name =
    typeof fm.name === "string" && fm.name.trim()
      ? slugify(fm.name.trim())
      : undefined
  const description =
    typeof fm.description === "string" && fm.description.trim()
      ? fm.description.trim()
      : undefined

  const meta = isRecord(fm.metadata) ? { ...fm.metadata } : undefined
  const rawVersion =
    (meta?.version !== undefined ? String(meta.version) : undefined) ??
    (fm.version !== undefined ? String(fm.version) : undefined)
  const cleanedVersion = rawVersion?.replace(/^v/i, "").trim()
  const version =
    cleanedVersion && VERSION_RE.test(cleanedVersion)
      ? cleanedVersion
      : undefined

  const { name: _n, description: _d, metadata: _m, ...rest } = fm
  if (meta && "version" in meta) delete meta.version
  const extra: Record<string, unknown> = {
    ...rest,
    ...(meta && Object.keys(meta).length > 0 ? { metadata: meta } : {}),
  }

  return {
    name,
    description,
    version,
    body,
    frontmatterExtra: Object.keys(extra).length > 0 ? extra : null,
  }
}

const IGNORED_PARTS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  "__MACOSX",
  ".DS_Store",
  "Thumbs.db",
])

function isIgnoredPath(path: string) {
  return path.split("/").some((p) => !p || IGNORED_PARTS.has(p))
}

function decodeUtf8(bytes: Uint8Array): string | null {
  // Reject obvious binary files (NUL bytes in the first 8 KiB).
  const probe = Math.min(bytes.length, 8192)
  for (let i = 0; i < probe; i++) {
    if (bytes[i] === 0) return null
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

// Minimal browser-native ZIP / .skill extractor (supports STORE=0 and DEFLATE=8).
async function extractZip(
  file: File
): Promise<{ path: string; bytes: Uint8Array }[]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  // Locate End of Central Directory (EOCD) signature 0x06054b50.
  let eocd = -1
  const minPos = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error("invalid zip archive")

  const cdCount = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  const out: { path: string; bytes: Uint8Array }[] = []
  let pos = cdOffset

  for (let n = 0; n < cdCount; n++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break
    const method = view.getUint16(pos + 10, true)
    const compSize = view.getUint32(pos + 20, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    const name = new TextDecoder().decode(
      buf.subarray(pos + 46, pos + 46 + nameLen)
    )
    pos += 46 + nameLen + extraLen + commentLen

    if (name.endsWith("/") || isIgnoredPath(name)) continue
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue
    const lNameLen = view.getUint16(localOffset + 26, true)
    const lExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)

    let bytes: Uint8Array
    if (method === 0) {
      bytes = raw
    } else if (method === 8) {
      const ds = new DecompressionStream("deflate-raw")
      const stream = new Blob([raw]).stream().pipeThrough(ds)
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    } else {
      continue
    }
    out.push({ path: name, bytes })
  }
  return out
}

// Normalizes a set of raw entries (from folder picker, drag & drop or zip) into one skill.
function assembleSkill(
  entries: { path: string; bytes: Uint8Array }[],
  fallbackName?: string
): ImportedSkill {
  const clean = entries
    .map((e) => ({
      path: e.path.replace(/\\/g, "/").replace(/^\/+/, ""),
      bytes: e.bytes,
    }))
    .filter((e) => e.path && !isIgnoredPath(e.path))

  if (clean.length === 0)
    throw new Error("no readable files found in the selection")

  // Strip a shared top-level directory (e.g. "my-skill/SKILL.md" → "SKILL.md").
  const firstSegments = new Set(
    clean.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : ""))
  )
  let rootFolder = fallbackName
  let stripped = clean
  if (firstSegments.size === 1) {
    const only = [...firstSegments][0]
    if (only) {
      rootFolder = only
      stripped = clean.map((e) => ({
        path: e.path.slice(only.length + 1),
        bytes: e.bytes,
      }))
    }
  }

  // Locate SKILL.md (case-insensitive fallback if only one .md was dropped).
  let skillEntry = stripped.find(
    (e) => e.path === "SKILL.md" || e.path.toLowerCase() === "skill.md"
  )
  if (!skillEntry && stripped.length === 1 && stripped[0]?.path.endsWith(".md"))
    skillEntry = stripped[0]

  if (!skillEntry)
    throw new Error(
      "SKILL.md not found (select a skill folder, SKILL.md or .zip)"
    )

  const skillText = decodeUtf8(skillEntry.bytes)
  if (skillText === null) throw new Error("SKILL.md is not valid UTF-8 text")

  const parsed = parseSkillMd(skillText)
  const files: SkillFile[] = []
  const skippedBinary: string[] = []

  for (const item of stripped) {
    if (item === skillEntry) continue
    const text = decodeUtf8(item.bytes)
    if (text === null) {
      skippedBinary.push(item.path)
      continue
    }
    files.push({ path: item.path, content: text })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))

  return {
    ...parsed,
    name: parsed.name ?? (rootFolder ? slugify(rootFolder) : undefined),
    files,
    skippedBinary,
    sourceName: rootFolder ?? skillEntry.path,
  }
}

export async function importFromFileList(
  list: FileList
): Promise<ImportedSkill> {
  const arr = [...list]
  if (arr.length === 1 && arr[0] && /\.(zip|skill)$/i.test(arr[0].name)) {
    const entries = await extractZip(arr[0])
    const base = arr[0].name.replace(/\.(zip|skill)$/i, "")
    return assembleSkill(entries, base)
  }
  const entries = await Promise.all(
    arr.map(async (f) => ({
      path: f.webkitRelativePath || f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    }))
  )
  return assembleSkill(entries)
}

// Recursively reads FileSystemEntry items from a drag-and-drop event.
async function readEntry(
  entry: FileSystemEntry,
  prefix = ""
): Promise<{ path: string; bytes: Uint8Array }[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    )
    return [
      {
        path: prefix ? `${prefix}/${entry.name}` : entry.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    ]
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children: FileSystemEntry[] = []
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      )
      if (!batch.length) break
      children.push(...batch)
    }
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    const nested = await Promise.all(
      children.map((c) => readEntry(c, nextPrefix))
    )
    return nested.flat()
  }
  return []
}

export async function importFromDataTransfer(
  dt: DataTransfer
): Promise<ImportedSkill> {
  const items = [...dt.items]
  const fsEntries = items
    .map((it) => it.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e)

  if (
    fsEntries.length === 1 &&
    fsEntries[0]?.isFile &&
    /\.(zip|skill)$/i.test(fsEntries[0].name)
  ) {
    const file = dt.files[0]
    if (file) {
      const entries = await extractZip(file)
      return assembleSkill(entries, file.name.replace(/\.(zip|skill)$/i, ""))
    }
  }

  if (fsEntries.length > 0) {
    const collected = (
      await Promise.all(fsEntries.map((e) => readEntry(e)))
    ).flat()
    return assembleSkill(collected)
  }

  return importFromFileList(dt.files)
}
