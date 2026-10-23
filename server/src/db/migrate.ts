import { resolve } from "node:path"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { db } from "./index.js"

// Applies server/drizzle migrations on startup (src/db and dist/db are two levels below).
export function runMigrations() {
  migrate(db, {
    migrationsFolder: resolve(import.meta.dirname, "../../drizzle"),
  })
}
