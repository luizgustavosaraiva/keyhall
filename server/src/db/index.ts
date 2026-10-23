import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema.js"

const path = process.env.DATABASE_PATH ?? "../data/keyhall.db"
mkdirSync(dirname(path), { recursive: true })

export const db = drizzle(new Database(path), { schema })
