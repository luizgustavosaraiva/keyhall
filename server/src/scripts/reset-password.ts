// Sets a new password for an account and ends its sessions. Access to the server already
// proves ownership. Usage (in the container: docker exec -it keyhall node dist/scripts/reset-password.js
// <email>): pnpm --filter server password:reset <email>
import { auth } from "../auth.js"
import { readPassword } from "./prompt.js"

const [email] = process.argv.slice(2)
if (!email) {
  console.error("usage: reset-password <email>")
  process.exit(1)
}
const ctx = await auth.$context
const found = await ctx.internalAdapter.findUserByEmail(email.toLowerCase())
if (!found) {
  console.error(`no account with e-mail ${email}`)
  process.exit(1)
}
const password = await readPassword("New password (min. 8): ")
await ctx.internalAdapter.updatePassword(
  found.user.id,
  await ctx.password.hash(password)
)
await ctx.internalAdapter.deleteUserSessions(found.user.id)
console.log(`password changed for ${email}; existing sessions were signed out`)
