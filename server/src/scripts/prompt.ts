import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline"

// Reads the password from the terminal without echo (or KEYHALL_ADMIN_PASSWORD), never from args.
export async function readPassword(label = "Password (min. 8): ") {
  if (process.env.KEYHALL_ADMIN_PASSWORD)
    return process.env.KEYHALL_ADMIN_PASSWORD
  if (!stdin.isTTY)
    throw new Error(
      "run it in a terminal (docker exec -it) or set KEYHALL_ADMIN_PASSWORD"
    )
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  // Mutes the echo while the password is typed.
  const write = rl as unknown as { _writeToOutput: (s: string) => void }
  write._writeToOutput = (s: string) => {
    if (s.includes(label)) stdout.write(s)
  }
  const answer = await new Promise<string>((resolve) =>
    rl.question(label, resolve)
  )
  rl.close()
  stdout.write("\n")
  if (answer.length < 8)
    throw new Error("the password needs at least 8 characters")
  return answer
}
