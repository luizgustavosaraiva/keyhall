// Rotates the master key: re-encrypts every secret in the database with the new key, in one transaction.
// Stop the server first. Usage (in the container: node dist/scripts/rotate-key.js):
//   KEYHALL_ENCRYPTION_KEY=<current> KEYHALL_NEW_ENCRYPTION_KEY=<new> pnpm --filter server key:rotate
// Then set KEYHALL_ENCRYPTION_KEY to the new key and start the server.
import { and, eq } from "drizzle-orm"
import { decrypt, encrypt, key } from "../crypto.js"
import { db } from "../db/index.js"
import { connection, secretVersion } from "../db/schema.js"

const oldKey = key()
const newKey = key("KEYHALL_NEW_ENCRYPTION_KEY")
const fields = [
  "clientInfoEnc",
  "tokensEnc",
  "codeVerifierEnc",
  "discoveryEnc",
  "secretEnc",
] as const

const rows = db.select().from(connection).all()
// Vault: only each version's key is under the master key; the values stay as they are.
const versions = db.select().from(secretVersion).all()
let values = 0
db.transaction((tx) => {
  for (const row of rows) {
    const set: Partial<Record<(typeof fields)[number], string>> = {}
    for (const f of fields) {
      if (!row[f]) continue
      set[f] = encrypt(decrypt(row[f], oldKey), newKey)
      values++
    }
    if (Object.keys(set).length)
      tx.update(connection).set(set).where(eq(connection.id, row.id)).run()
  }
  for (const v of versions) {
    tx.update(secretVersion)
      .set({ keyEnc: encrypt(decrypt(v.keyEnc, oldKey), newKey) })
      .where(
        and(
          eq(secretVersion.secretId, v.secretId),
          eq(secretVersion.version, v.version)
        )
      )
      .run()
  }
})
console.log(
  `${values} connection secrets and ${versions.length} vault versions re-encrypted. Now set KEYHALL_ENCRYPTION_KEY to the new key.`
)
