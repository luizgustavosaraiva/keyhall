import { randomInt, timingSafeEqual } from "node:crypto"
import { count, eq } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"
import { auth } from "../auth.js"
import { db } from "../db/index.js"
import { organization, user } from "../db/schema.js"
import { slug } from "./admin.js"

// First run: with no users in the database, the panel asks for name, e-mail and password, and
// whoever fills it in becomes admin. So nobody can claim a freshly exposed instance, the form
// also asks for a setup code that only appears in the server log.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const MAX_ATTEMPTS = 20

let code: string | undefined
let attempts = 0
let running = false

const newCode = () => {
  code = Array.from(
    { length: 8 },
    () => ALPHABET[randomInt(ALPHABET.length)]
  ).join("")
  attempts = 0
  console.log(
    `keyhall: first-run setup pending. Setup code: ${code.slice(0, 4)}-${code.slice(4)}`
  )
}

async function needsSetup() {
  const [{ n }] = await db.select({ n: count() }).from(user)
  return n === 0
}

// Called on startup: with no users, generates and prints the code.
export async function announceSetup() {
  if (await needsSetup()) newCode()
}

const matches = (input: string) => {
  if (!code) return false
  const a = Buffer.from(input.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  const b = Buffer.from(code)
  return a.length === b.length && timingSafeEqual(a, b)
}

const setupInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8, "the password needs at least 8 characters"),
  organization: z.object({ name: z.string().min(1), slug }),
})

export const setup = new Hono()
  .get("/", async (c) => c.json({ needed: await needsSetup() }))
  .post("/", async (c) => {
    if (running || !(await needsSetup()))
      return c.json({ error: "keyhall is already set up" }, 409)
    const input = setupInput.safeParse(await c.req.json())
    if (!input.success)
      return c.json({ error: z.prettifyError(input.error) }, 400)
    if (!matches(input.data.code)) {
      // Too many wrong attempts replace the code; the new one appears in the log.
      if (++attempts >= MAX_ATTEMPTS) newCode()
      return c.json({ error: "invalid setup code" }, 403)
    }
    running = true
    try {
      const { name, email, password, organization: org } = input.data
      await auth.api.createUser({
        body: { email, password, name, role: "admin" },
      })
      // The migration creates the default organization; the first run names it.
      await db
        .update(organization)
        .set({ name: org.name, slug: org.slug })
        .where(eq(organization.id, "org-default"))
      code = undefined
      console.log(`keyhall: admin created (${email})`)
      return c.json({ ok: true }, 201)
    } finally {
      running = false
    }
  })
