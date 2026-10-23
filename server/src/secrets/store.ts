import { randomUUID } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"
import type { Target } from "../access.js"
import { unseal } from "../crypto.js"
import { db } from "../db/index.js"
import {
  project,
  scopeSecret,
  secret,
  secretAccess,
  secretVersion,
} from "../db/schema.js"

type Secret = typeof secret.$inferSelect
export type Reachable = { secret: Secret; project: typeof project.$inferSelect }

// Environment variable name: the same name works for references and the env format.
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

// {{secret:NAME}} uses the secret of the same project; {{secret:project/NAME}}, one from another
// project of the same organization.
const REF =
  /\{\{\s*secret:(?:([a-z0-9]+(?:-[a-z0-9]+)*)\/)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export const refsIn = (text: string) =>
  [...text.matchAll(REF)].map((m) => ({ project: m[1], name: m[2] }))

// Current value of a secret (synchronous: better-sqlite3 reads without awaiting).
export function currentValue(s: Secret) {
  const row = db
    .select()
    .from(secretVersion)
    .where(
      and(
        eq(secretVersion.secretId, s.id),
        eq(secretVersion.version, s.version)
      )
    )
    .get()
  if (!row) throw new Error(`secret ${s.name} has no value`)
  return unseal(row)
}

function findRef(projectId: string, ref: { project?: string; name: string }) {
  const home = db.select().from(project).where(eq(project.id, projectId)).get()
  if (!home) return undefined
  const target = ref.project
    ? db
        .select()
        .from(project)
        .where(
          and(eq(project.orgId, home.orgId), eq(project.slug, ref.project))
        )
        .get()
    : home
  if (!target) return undefined
  return db
    .select()
    .from(secret)
    .where(and(eq(secret.projectId, target.id), eq(secret.name, ref.name)))
    .get()
}

// Replaces each {{secret:…}} with its value. A reference without a matching secret is an error.
export function resolveRefs(text: string, projectId: string) {
  return text.replace(
    REF,
    (_, projectSlug: string | undefined, name: string) => {
      const s = findRef(projectId, { project: projectSlug, name })
      if (!s)
        throw new Error(
          `secret ${projectSlug ? `${projectSlug}/` : ""}${name} not found`
        )
      return currentValue(s)
    }
  )
}

// Checks references without decrypting anything; returns the missing ones.
export const missingRefs = (text: string, projectId: string) =>
  refsIn(text)
    .filter((r) => !findRef(projectId, r))
    .map((r) => (r.project ? `${r.project}/${r.name}` : r.name))

// Secrets a token reaches: the organization's, the project's, or those picked in the scope.
export async function reachableSecrets(target: Target): Promise<Reachable[]> {
  const base = db
    .select({ secret, project })
    .from(secret)
    .innerJoin(project, eq(secret.projectId, project.id))
  if (target.kind === "org") return base.where(eq(project.orgId, target.org.id))
  if (target.kind === "project")
    return base.where(eq(secret.projectId, target.project.id))
  const ids = (
    await db
      .select({ id: scopeSecret.secretId })
      .from(scopeSecret)
      .where(eq(scopeSecret.scopeId, target.scope.id))
  ).map((r) => r.id)
  if (!ids.length) return []
  return base.where(inArray(secret.id, ids))
}

export async function logAccess(
  s: Secret,
  via: "rest" | "mcp" | "panel",
  actor: string
) {
  await db.insert(secretAccess).values({
    id: randomUUID(),
    secretId: s.id,
    version: s.version,
    via,
    actor,
  })
}

// Finds a reachable secret by name; across projects, the project breaks the tie.
export function pick(list: Reachable[], name: string, projectSlug?: string) {
  const found = list.filter(
    (r) =>
      r.secret.name === name && (!projectSlug || r.project.slug === projectSlug)
  )
  if (found.length > 1)
    return {
      error: `secret ${name} exists in several projects (${found.map((r) => r.project.slug).join(", ")}); pass the project`,
    }
  return found[0] ? { found: found[0] } : { error: `secret ${name} not found` }
}
