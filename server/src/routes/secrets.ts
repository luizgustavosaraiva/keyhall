import { Hono } from "hono"
import type { Access } from "../access.js"
import {
  currentValue,
  logAccess,
  pick,
  reachableSecrets,
} from "../secrets/store.js"

// Shell single quotes: the env format works with `export $(…)`, `source` and --env-file.
const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

// /api/secrets: list (no values) or, with ?format=env, NAME='value' for all reachable ones.
// /api/secrets/<name> and /api/secrets/<project>/<name>: one value. Every read is logged.
export const secretsApi = new Hono<{ Variables: { access: Access } }>()
  .get("/", async (c) => {
    const access = c.get("access")
    const projectSlug = c.req.query("project")
    const list = (await reachableSecrets(access.target)).filter(
      (r) => !projectSlug || r.project.slug === projectSlug
    )
    if (c.req.query("format") !== "env")
      return c.json(
        list.map((r) => ({
          name: r.secret.name,
          project: r.project.slug,
          description: r.secret.description,
          version: r.secret.version,
        }))
      )
    const names = list.map((r) => r.secret.name)
    const repeated = names.filter((n, i) => names.indexOf(n) !== i)
    if (repeated.length)
      return c.json(
        {
          error: `the same name exists in several projects (${[...new Set(repeated)].join(", ")}); pass ?project=<slug>`,
        },
        409
      )
    const lines: string[] = []
    for (const r of list) {
      lines.push(`${r.secret.name}=${shellQuote(currentValue(r.secret))}`)
      await logAccess(r.secret, "rest", `token ${access.token.name}`)
    }
    return c.text(lines.length ? `${lines.join("\n")}\n` : "")
  })
  .get("/:project/:name", (c) =>
    read(c.get("access"), c.req.param("name"), c.req.param("project"))
  )
  .get("/:name", (c) => read(c.get("access"), c.req.param("name")))

async function read(access: Access, name: string, projectSlug?: string) {
  const result = pick(await reachableSecrets(access.target), name, projectSlug)
  if (!result.found)
    return Response.json(
      { error: result.error },
      { status: result.error.includes("several") ? 409 : 404 }
    )
  const { secret, project } = result.found
  await logAccess(secret, "rest", `token ${access.token.name}`)
  return Response.json({
    name: secret.name,
    project: project.slug,
    version: secret.version,
    value: currentValue(secret),
  })
}
