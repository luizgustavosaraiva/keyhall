// Consistent copy of the database, even while the server runs (SQLite backup API).
// Usage (in the container: node dist/scripts/backup.js <target>): pnpm --filter server db:backup <target>
// The database alone isn't enough: without KEYHALL_ENCRYPTION_KEY its secrets can't be read.
import Database from "better-sqlite3"

const [target] = process.argv.slice(2)
if (!target) {
  console.error("usage: backup <target file>")
  process.exit(1)
}
const source = new Database(process.env.DATABASE_PATH ?? "../data/keyhall.db", {
  readonly: true,
  fileMustExist: true,
})
await source.backup(target)
source.close()
console.log(`backup written to ${target}`)
