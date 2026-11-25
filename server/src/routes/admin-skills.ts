import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import { db } from "../db/index.js"
import { type SkillFile, skill, skillVersion } from "../db/schema.js"
import {
  getSkillVersion,
  getSkillWithVersions,
  MAX_SKILL_BYTES,
  nextMajorVersion,
  nextMinorVersion,
  renderSkillMd,
  SKILL_SLUG,
  SKILL_VERSION,
  type SkillRow,
  type SkillVersionRow,
  sha256Digest,
  totalSkillBytes,
  validateSkillFiles,
} from "../skills/store.js"
import { type AdminEnv, requireAdmin } from "./middleware.js"

const skillSlug = z
  .string()
  .trim()
  .regex(
    SKILL_SLUG,
    "use lowercase letters, numbers and single hyphens (max 64 characters)"
  )

const versionString = z
  .string()
  .trim()
  .regex(SKILL_VERSION, "use a version like 1.0, 1.1 or 2.0")

const fileInput = z.object({
  path: z.string().trim().min(1).max(255),
  content: z.string(),
  mimeType: z.string().trim().max(120).optional(),
})

const frontmatterExtraInput = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()

const createSkillInput = z.object({
  projectId: z.string().min(1),
  slug: skillSlug,
  version: versionString.default("1.0"),
  description: z.string().trim().min(1).max(1024),
  body: z.string().min(1),
  frontmatterExtra: frontmatterExtraInput,
  files: z.array(fileInput).default([]),
  changelog: z.string().trim().max(500).optional(),
})

const createVersionInput = z.object({
  // Either an explicit version (e.g. "1.1" or "2.0") or an automatic bump from the latest version.
  version: versionString.optional(),
  bump: z.enum(["minor", "major"]).default("minor"),
  description: z.string().trim().min(1).max(1024),
  body: z.string().min(1),
  frontmatterExtra: frontmatterExtraInput,
  files: z.array(fileInput).default([]),
  changelog: z.string().trim().max(500).optional(),
  activate: z.boolean().default(true),
})

const activateInput = z.object({
  version: versionString,
})

function summarizeVersion(slug: string, v: SkillVersionRow) {
  const md = renderSkillMd(slug, v)
  const { digest, size } = sha256Digest(md)
  return {
    version: v.version,
    seq: v.seq,
    description: v.description,
    changelog: v.changelog,
    fileCount: v.files.length,
    digest,
    size,
    createdBy: v.createdBy,
    createdAt: v.createdAt,
  }
}

function detailVersion(slug: string, v: SkillVersionRow) {
  const md = renderSkillMd(slug, v)
  const { digest, size } = sha256Digest(md)
  return {
    version: v.version,
    seq: v.seq,
    description: v.description,
    body: v.body,
    frontmatterExtra: v.frontmatterExtra ?? null,
    files: v.files,
    changelog: v.changelog,
    renderedSkillMd: md,
    digest,
    size,
    createdBy: v.createdBy,
    createdAt: v.createdAt,
  }
}

function publicSkillSummary(row: SkillRow, versions: SkillVersionRow[]) {
  const active =
    versions.find((v) => v.version === row.activeVersion) ?? versions[0]
  const latest = versions[0]
  const md = active ? renderSkillMd(row.slug, active) : ""
  const { digest } = sha256Digest(md)
  return {
    id: row.id,
    projectId: row.projectId,
    slug: row.slug,
    activeVersion: row.activeVersion,
    latestVersion: latest?.version ?? row.activeVersion,
    versionCount: versions.length,
    description: active?.description ?? "",
    fileCount: active?.files.length ?? 0,
    digest,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const adminSkills = new Hono<AdminEnv>()
  .use(requireAdmin)
  .get("/", async (c) => {
    const rows = await db.select().from(skill).orderBy(skill.slug)
    const versions = await db
      .select()
      .from(skillVersion)
      .orderBy(desc(skillVersion.seq))
    const bySkill = new Map<string, SkillVersionRow[]>()
    for (const v of versions) {
      const list = bySkill.get(v.skillId) ?? []
      list.push(v)
      bySkill.set(v.skillId, list)
    }
    return c.json(
      rows.map((r) => publicSkillSummary(r, bySkill.get(r.id) ?? []))
    )
  })
  .get("/:id", async (c) => {
    const found = await getSkillWithVersions(c.req.param("id"))
    if (!found) return c.json({ error: "skill not found" }, 404)
    const active =
      found.versions.find((v) => v.version === found.skill.activeVersion) ??
      found.versions[0]
    return c.json({
      ...publicSkillSummary(found.skill, found.versions),
      active: active ? detailVersion(found.skill.slug, active) : null,
      versions: found.versions.map((v) =>
        summarizeVersion(found.skill.slug, v)
      ),
    })
  })
  .get("/:id/versions/:version", async (c) => {
    const found = await getSkillWithVersions(c.req.param("id"))
    if (!found) return c.json({ error: "skill not found" }, 404)
    const ver = await getSkillVersion(found.skill.id, c.req.param("version"))
    if (!ver) return c.json({ error: "version not found" }, 404)
    return c.json(detailVersion(found.skill.slug, ver))
  })
  .post("/", async (c) => {
    const input = createSkillInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const data = input.data
    const checkedFiles = validateSkillFiles(data.files as SkillFile[])
    if (!checkedFiles.ok) return c.json({ error: checkedFiles.error }, 400)

    const bytes = totalSkillBytes(data.slug, {
      version: data.version,
      description: data.description,
      body: data.body,
      frontmatterExtra: data.frontmatterExtra ?? null,
      files: checkedFiles.files,
    })
    if (bytes > MAX_SKILL_BYTES)
      return c.json({ error: "skill exceeds the 16 MiB MCP limit" }, 400)

    const [dup] = await db
      .select({ id: skill.id })
      .from(skill)
      .where(
        and(eq(skill.projectId, data.projectId), eq(skill.slug, data.slug))
      )
    if (dup)
      return c.json(
        { error: `a skill named ${data.slug} already exists in this project` },
        409
      )

    const id = randomUUID()
    const author = c.get("session").user.email
    db.transaction((tx) => {
      tx.insert(skill)
        .values({
          id,
          projectId: data.projectId,
          slug: data.slug,
          activeVersion: data.version,
        })
        .run()
      tx.insert(skillVersion)
        .values({
          skillId: id,
          version: data.version,
          seq: 1,
          description: data.description,
          body: data.body,
          frontmatterExtra: data.frontmatterExtra ?? null,
          files: checkedFiles.files,
          changelog: data.changelog || null,
          createdBy: author,
        })
        .run()
    })
    const created = await getSkillWithVersions(id)
    return c.json(
      created && publicSkillSummary(created.skill, created.versions),
      201
    )
  })
  // Publishes a new immutable version (e.g. 1.0 → 1.1 or 2.0) and optionally activates it.
  .post("/:id/versions", async (c) => {
    const found = await getSkillWithVersions(c.req.param("id"))
    if (!found) return c.json({ error: "skill not found" }, 404)
    const input = createVersionInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const data = input.data
    const checkedFiles = validateSkillFiles(data.files as SkillFile[])
    if (!checkedFiles.ok) return c.json({ error: checkedFiles.error }, 400)

    const latest = found.versions[0]
    const baseVer = latest?.version ?? found.skill.activeVersion
    let nextVer =
      data.version ??
      (data.bump === "major"
        ? nextMajorVersion(baseVer)
        : nextMinorVersion(baseVer))

    // If an auto-bumped version already exists (e.g. after editing from an older version),
    // keep bumping until free. Explicit versions return 409 on collision.
    const existing = new Set(found.versions.map((v) => v.version))
    if (data.version && existing.has(data.version))
      return c.json({ error: `version ${data.version} already exists` }, 409)
    while (existing.has(nextVer)) {
      nextVer =
        data.bump === "major"
          ? nextMajorVersion(nextVer)
          : nextMinorVersion(nextVer)
    }

    const bytes = totalSkillBytes(found.skill.slug, {
      version: nextVer,
      description: data.description,
      body: data.body,
      frontmatterExtra: data.frontmatterExtra ?? null,
      files: checkedFiles.files,
    })
    if (bytes > MAX_SKILL_BYTES)
      return c.json({ error: "skill exceeds the 16 MiB MCP limit" }, 400)

    const nextSeq = (latest?.seq ?? 0) + 1
    const author = c.get("session").user.email
    db.transaction((tx) => {
      tx.insert(skillVersion)
        .values({
          skillId: found.skill.id,
          version: nextVer,
          seq: nextSeq,
          description: data.description,
          body: data.body,
          frontmatterExtra: data.frontmatterExtra ?? null,
          files: checkedFiles.files,
          changelog: data.changelog || null,
          createdBy: author,
        })
        .run()
      if (data.activate)
        tx.update(skill)
          .set({ activeVersion: nextVer })
          .where(eq(skill.id, found.skill.id))
          .run()
    })
    const updated = await getSkillWithVersions(found.skill.id)
    const ver = updated?.versions.find((v) => v.version === nextVer)
    return c.json(
      updated && {
        ...publicSkillSummary(updated.skill, updated.versions),
        published: ver ? detailVersion(updated.skill.slug, ver) : null,
      },
      201
    )
  })
  // Switches or rolls back the active version served at the canonical skill:// URI.
  .put("/:id/active", async (c) => {
    const found = await getSkillWithVersions(c.req.param("id"))
    if (!found) return c.json({ error: "skill not found" }, 404)
    const input = activateInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    const target = found.versions.find((v) => v.version === input.data.version)
    if (!target)
      return c.json({ error: `version ${input.data.version} not found` }, 404)
    await db
      .update(skill)
      .set({ activeVersion: target.version })
      .where(eq(skill.id, found.skill.id))
    const updated = await getSkillWithVersions(found.skill.id)
    return c.json(
      updated && publicSkillSummary(updated.skill, updated.versions)
    )
  })
  .delete("/:id", async (c) => {
    const found = await getSkillWithVersions(c.req.param("id"))
    if (!found) return c.json({ error: "skill not found" }, 404)
    await db.delete(skill).where(eq(skill.id, found.skill.id))
    return c.body(null, 204)
  })
