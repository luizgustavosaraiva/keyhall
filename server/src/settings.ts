import { eq } from "drizzle-orm"
import { db } from "./db/index.js"
import { setting } from "./db/schema.js"

// Instance settings kept in the database, so the panel can change them. Each one starts from an
// environment variable (or a built-in default) until someone saves it.

export function readSetting<T>(key: string): T | undefined {
  const row = db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, key))
    .get()
  return row?.value as T | undefined
}

export function writeSetting(key: string, value: unknown) {
  db.insert(setting)
    .values({ key, value })
    .onConflictDoUpdate({ target: setting.key, set: { value } })
    .run()
}

// How long a call that needs approval waits for a decision, and how long an approval holds.
export type ApprovalTiming = { waitSeconds: number; validMinutes: number }

export const APPROVAL_LIMITS = {
  // Under the usual 60 s client timeout and Code Mode's 60 s run limit.
  waitSeconds: { min: 0, max: 55 },
  validMinutes: { min: 1, max: 24 * 60 },
}

const envNumber = (name: string, fallback: number) => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && process.env[name]?.trim() ? n : fallback
}

const clamp = (n: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Math.round(n)))

export function approvalTiming(): ApprovalTiming {
  const saved = readSetting<Partial<ApprovalTiming>>("approvals") ?? {}
  return {
    waitSeconds: clamp(
      saved.waitSeconds ?? envNumber("KEYHALL_APPROVAL_WAIT_SECONDS", 45),
      APPROVAL_LIMITS.waitSeconds
    ),
    validMinutes: clamp(
      saved.validMinutes ?? envNumber("KEYHALL_APPROVAL_VALID_MINUTES", 15),
      APPROVAL_LIMITS.validMinutes
    ),
  }
}
