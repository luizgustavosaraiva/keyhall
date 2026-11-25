import { createHash } from "node:crypto"
import { and, desc, eq, inArray } from "drizzle-orm"
import type { Target } from "../access.js"
import { db } from "../db/index.js"
import {
  memberSkill,
  project,
  type SkillFile,
  scopeSkill,
  skill,
  skillVersion,
} from "../db/schema.js"

export type SkillRow = typeof skill.$inferSelect
export type SkillVersionRow = typeof skillVersion.$inferSelect

export type ReachableSkill = {
  skill: SkillRow
  project: typeof project.$inferSelect
  active: SkillVersionRow
  versions: SkillVersionRow[]
}

// Agent Skills specification naming rules: lowercase letters, digits and single hyphens,
// starting and ending with a letter or digit, up to 64 characters.
export const SKILL_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

// Semantic version strings like 1.0, 1.1, 2.0 or 1.1.2.
export const SKILL_VERSION = /^\d+\.\d+(?:\.\d+)?$/

// Limits fixed by SEP-2640 (io.modelcontextprotocol/skills).
export const MAX_SKILL_RESOURCES = 512
export const MAX_SKILL_BYTES = 16 * 1024 * 1024

// Safe relative POSIX path for supporting files inside a skill directory.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

export function normalizeFilePath(raw: string): string | null {
  const path = raw.trim().replace(/^\/+/, "")
  if (!path || path.endsWith("/") || path.includes("\\")) return null
  const parts = path.split("/")
  if (parts.some((p) => !p || p === "." || p === ".." || !SAFE_SEGMENT.test(p)))
    return null
  const normalized = parts.join("/")
  if (normalized === "SKILL.md") return null
  return normalized
}

export function validateSkillFiles(files: SkillFile[]):
  | {
      ok: true
      files: SkillFile[]
    }
  | {
      ok: false
      error: string
    } {
  if (files.length >= MAX_SKILL_RESOURCES)
    return {
      ok: false,
      error: `a skill may have at most ${MAX_SKILL_RESOURCES - 1} supporting files`,
    }
  const seen = new Set<string>()
  const out: SkillFile[] = []
  for (const f of files) {
    const path = normalizeFilePath(f.path)
    if (!path)
      return {
        ok: false,
        error: `invalid file path: ${f.path} (use relative paths like references/guide.md, not SKILL.md)`,
      }
    if (seen.has(path))
      return { ok: false, error: `duplicate file path: ${path}` }
    seen.add(path)
    out.push({
      path,
      content: f.content,
      ...(f.mimeType?.trim() ? { mimeType: f.mimeType.trim() } : {}),
    })
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  return { ok: true, files: out }
}

export function nextMinorVersion(current: string): string {
  const [major = 1, minor = 0] = current.split(".").map(Number)
  return `${major}.${minor + 1}`
}

export function nextMajorVersion(current: string): string {
  const [major = 1] = current.split(".").map(Number)
  return `${major + 1}.0`
}

const MIME_BY_EXT: Record<string, string> = {
  md: "text/markdown",
  mdx: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "application/toml",
  csv: "text/csv",
  xml: "application/xml",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  sh: "text/x-shellscript",
  bash: "text/x-shellscript",
  sql: "application/sql",
}

export function inferMimeType(path: string, explicit?: string): string {
  if (explicit) return explicit
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXT[ext] ?? "text/plain"
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

// Builds the verbatim JSON frontmatter object for a skill version.
// name, description and metadata.version are always authoritative.
export function buildFrontmatter(
  slug: string,
  v: Pick<SkillVersionRow, "version" | "description" | "frontmatterExtra">
): { name: string; description: string; [key: string]: unknown } {
  const extra = isRecord(v.frontmatterExtra) ? v.frontmatterExtra : {}
  const { name: _n, description: _d, metadata: extraMeta, ...rest } = extra
  const metadata = {
    ...(isRecord(extraMeta) ? extraMeta : {}),
    version: v.version,
  }
  return {
    name: slug,
    description: v.description,
    ...rest,
    metadata,
  }
}

// YAML keywords/numbers that must be quoted so every YAML parser reads them back as strings.
const SAFE_BARE_YAML = /^[a-z][a-z0-9-]*$/
const YAML_KEYWORDS = new Set([
  "true",
  "false",
  "null",
  "yes",
  "no",
  "on",
  "off",
])

function yamlScalar(value: unknown): string {
  if (typeof value === "string") {
    if (SAFE_BARE_YAML.test(value) && !YAML_KEYWORDS.has(value)) return value
    return JSON.stringify(value)
  }
  return JSON.stringify(value)
}

function yamlObject(obj: Record<string, unknown>, indent = 0): string {
  const pad = " ".repeat(indent)
  const lines: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    const k = /^[A-Za-z0-9_.-]+$/.test(key) ? key : JSON.stringify(key)
    if (isRecord(value) && Object.keys(value).length > 0) {
      lines.push(`${pad}${k}:`)
      lines.push(yamlObject(value, indent + 2))
    } else {
      lines.push(`${pad}${k}: ${yamlScalar(value)}`)
    }
  }
  return lines.join("\n")
}

// Renders the exact SKILL.md bytes served over resources/read and hashed for the manifest.
export function renderSkillMd(
  slug: string,
  v: Pick<
    SkillVersionRow,
    "version" | "description" | "body" | "frontmatterExtra"
  >
): string {
  const fm = buildFrontmatter(slug, v)
  const body = v.body.replace(/^\r?\n+/, "").replace(/\r?\n*$/, "")
  return `---\n${yamlObject(fm)}\n---\n\n${body}\n`
}

export function sha256Digest(content: string): {
  digest: string
  size: number
} {
  const buf = Buffer.from(content, "utf8")
  return {
    digest: `sha256:${createHash("sha256").update(buf).digest("hex")}`,
    size: buf.byteLength,
  }
}

export function totalSkillBytes(
  slug: string,
  v: Pick<
    SkillVersionRow,
    "version" | "description" | "body" | "frontmatterExtra" | "files"
  >
): number {
  let bytes = Buffer.byteLength(renderSkillMd(slug, v), "utf8")
  for (const f of v.files) bytes += Buffer.byteLength(f.content, "utf8")
  return bytes
}

export type McpSkillResource = {
  uri: string
  digest: string
  size: number
}

export type McpSkillEntry = {
  uri: string
  frontmatter: { name: string; description: string; [key: string]: unknown }
  resources: McpSkillResource[]
}

export function skillBasePath(
  projectSlug: string,
  skillSlug: string,
  multi: boolean,
  pinnedVersion?: string
): string {
  const parts: string[] = []
  if (multi) parts.push(projectSlug)
  if (pinnedVersion) parts.push(`v${pinnedVersion}`)
  parts.push(skillSlug)
  return parts.join("/")
}

export function buildMcpSkillEntry(
  item: { skill: SkillRow; project: { slug: string } },
  ver: SkillVersionRow,
  multi: boolean,
  pinnedVersion?: string
): McpSkillEntry {
  const base = skillBasePath(
    item.project.slug,
    item.skill.slug,
    multi,
    pinnedVersion
  )
  const skillUri = `skill://${base}/SKILL.md`
  const md = renderSkillMd(item.skill.slug, ver)
  const resources: McpSkillResource[] = [
    { uri: skillUri, ...sha256Digest(md) },
    ...ver.files.map((f) => ({
      uri: `skill://${base}/${f.path}`,
      ...sha256Digest(f.content),
    })),
  ]
  return {
    uri: skillUri,
    frontmatter: buildFrontmatter(item.skill.slug, ver),
    resources,
  }
}

// Whether a token's reach spans multiple projects (so skill URIs include the project prefix).
export function isMultiProjectTarget(target: Target): boolean {
  return (
    target.kind === "org" ||
    target.kind === "member" ||
    (target.kind === "scope" && target.scope.projectId === null)
  )
}

// Skills a token reaches: the organization's, the project's, or those picked in the scope / member.
export async function reachableSkills(
  target: Target
): Promise<ReachableSkill[]> {
  const base = db
    .select({ skill, project })
    .from(skill)
    .innerJoin(project, eq(skill.projectId, project.id))

  let rows: { skill: SkillRow; project: typeof project.$inferSelect }[]
  if (target.kind === "org") {
    rows = await base.where(eq(project.orgId, target.org.id))
  } else if (target.kind === "project") {
    rows = await base.where(eq(skill.projectId, target.project.id))
  } else if (target.kind === "member") {
    const granted = (
      await db
        .select({ id: memberSkill.skillId })
        .from(memberSkill)
        .where(eq(memberSkill.memberId, target.member.id))
    ).map((r) => r.id)
    rows = granted.length ? await base.where(inArray(skill.id, granted)) : []
  } else {
    const ids = (
      await db
        .select({ id: scopeSkill.skillId })
        .from(scopeSkill)
        .where(eq(scopeSkill.scopeId, target.scope.id))
    ).map((r) => r.id)
    rows = ids.length ? await base.where(inArray(skill.id, ids)) : []
  }

  if (!rows.length) return []
  const allVersions = await db
    .select()
    .from(skillVersion)
    .where(
      inArray(
        skillVersion.skillId,
        rows.map((r) => r.skill.id)
      )
    )
    .orderBy(desc(skillVersion.seq))

  const bySkill = new Map<string, SkillVersionRow[]>()
  for (const v of allVersions) {
    const list = bySkill.get(v.skillId) ?? []
    list.push(v)
    bySkill.set(v.skillId, list)
  }

  const out: ReachableSkill[] = []
  for (const r of rows) {
    const versions = bySkill.get(r.skill.id) ?? []
    const active =
      versions.find((v) => v.version === r.skill.activeVersion) ?? versions[0]
    if (!active) continue
    out.push({ skill: r.skill, project: r.project, active, versions })
  }
  out.sort((a, b) =>
    `${a.project.slug}/${a.skill.slug}`.localeCompare(
      `${b.project.slug}/${b.skill.slug}`
    )
  )
  return out
}

// Matches a skill:// URI against reachable skills (both active and pinned v<version> URIs).
export function resolveSkillUri(
  items: ReachableSkill[],
  multi: boolean,
  uri: string
): {
  item: ReachableSkill
  version: SkillVersionRow
  pinned: boolean
  basePath: string
  // "" for the skill root directory, or the relative path after skill://<basePath>/
  relPath: string
} | null {
  if (!uri.startsWith("skill://")) return null
  const raw = uri.slice("skill://".length)
  if (!raw || raw.endsWith("/")) return null
  const segments = raw.split("/")

  for (const item of items) {
    // Check active canonical path: [project?, slug, ...rest]
    const activeBase = multi
      ? [item.project.slug, item.skill.slug]
      : [item.skill.slug]
    if (
      segments.length >= activeBase.length &&
      activeBase.every((seg, i) => segments[i] === seg)
    ) {
      return {
        item,
        version: item.active,
        pinned: false,
        basePath: activeBase.join("/"),
        relPath: segments.slice(activeBase.length).join("/"),
      }
    }

    // Check pinned version path: [project?, v<version>, slug, ...rest]
    const versionIdx = multi ? 1 : 0
    if (
      segments.length >= versionIdx + 2 &&
      (!multi || segments[0] === item.project.slug) &&
      segments[versionIdx]?.startsWith("v") &&
      segments[versionIdx + 1] === item.skill.slug
    ) {
      const requestedVer = segments[versionIdx].slice(1)
      const matched = item.versions.find((v) => v.version === requestedVer)
      if (matched) {
        const pinnedBase = segments.slice(0, versionIdx + 2).join("/")
        return {
          item,
          version: matched,
          pinned: true,
          basePath: pinnedBase,
          relPath: segments.slice(versionIdx + 2).join("/"),
        }
      }
    }
  }
  return null
}

// Lists direct children of a skill directory resource (for resources/directory/read).
export function readSkillDirectory(
  items: ReachableSkill[],
  multi: boolean,
  uri: string
):
  | { uri: string; name: string; mimeType: string; description?: string }[]
  | null {
  const match = resolveSkillUri(items, multi, uri)
  if (!match) return null

  const prefix = match.relPath ? `${match.relPath}/` : ""
  const entries = new Map<
    string,
    { uri: string; name: string; mimeType: string; description?: string }
  >()

  // Root of the skill always contains SKILL.md.
  if (match.relPath === "") {
    entries.set("SKILL.md", {
      uri: `skill://${match.basePath}/SKILL.md`,
      name: "SKILL.md",
      mimeType: "text/markdown",
      description: match.version.description,
    })
  }

  let matchedAnyUnderSubdir = match.relPath === ""
  for (const f of match.version.files) {
    if (prefix && !f.path.startsWith(prefix)) continue
    matchedAnyUnderSubdir = true
    const rest = prefix ? f.path.slice(prefix.length) : f.path
    const slash = rest.indexOf("/")
    if (slash === -1) {
      entries.set(rest, {
        uri: `skill://${match.basePath}/${f.path}`,
        name: rest,
        mimeType: inferMimeType(f.path, f.mimeType),
      })
    } else {
      const dir = rest.slice(0, slash)
      if (!entries.has(dir)) {
        entries.set(dir, {
          uri: `skill://${match.basePath}/${prefix}${dir}`,
          name: dir,
          mimeType: "inode/directory",
        })
      }
    }
  }

  if (!matchedAnyUnderSubdir) return null
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function readSkillFile(
  items: ReachableSkill[],
  multi: boolean,
  uri: string
): { uri: string; mimeType: string; text: string } | null {
  const match = resolveSkillUri(items, multi, uri)
  if (!match?.relPath) return null
  if (match.relPath === "SKILL.md") {
    return {
      uri,
      mimeType: "text/markdown",
      text: renderSkillMd(match.item.skill.slug, match.version),
    }
  }
  const file = match.version.files.find((f) => f.path === match.relPath)
  if (!file) return null
  return {
    uri,
    mimeType: inferMimeType(file.path, file.mimeType),
    text: file.content,
  }
}

export async function getSkillWithVersions(id: string) {
  const [row] = await db.select().from(skill).where(eq(skill.id, id))
  if (!row) return null
  const versions = await db
    .select()
    .from(skillVersion)
    .where(eq(skillVersion.skillId, row.id))
    .orderBy(desc(skillVersion.seq))
  return { skill: row, versions }
}

export async function getSkillVersion(skillId: string, version: string) {
  const [row] = await db
    .select()
    .from(skillVersion)
    .where(
      and(eq(skillVersion.skillId, skillId), eq(skillVersion.version, version))
    )
  return row ?? null
}
