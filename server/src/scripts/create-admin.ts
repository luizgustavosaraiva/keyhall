// Creates an admin from the terminal: pnpm --filter server admin:create <email> "<name>"
// (in the container: node dist/scripts/create-admin.js). The usual path is the panel's first-run setup.
import { auth } from "../auth.js"
import { readPassword } from "./prompt.js"

const [email, name = "Admin"] = process.argv.slice(2)
if (!email) {
  console.error('usage: pnpm --filter server admin:create <email> "<name>"')
  process.exit(1)
}
const password = await readPassword()
const { user } = await auth.api.createUser({
  body: { email, password, name, role: "admin" },
})
console.log(`admin created: ${user.email}`)
