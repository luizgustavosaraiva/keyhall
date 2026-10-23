import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// Connection secrets (OAuth tokens, client credentials) are stored encrypted with
// AES-256-GCM. The key comes from the environment and is never written to the database.
// Key rotation (scripts/rotate-key.ts) passes the key explicitly.
export function key(name = "KEYHALL_ENCRYPTION_KEY"): Buffer {
  const raw = process.env[name]
  const buf = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0)
  if (buf.length !== 32) {
    throw new Error(
      `${name} must be 32 bytes in base64 (openssl rand -base64 32)`
    )
  }
  return buf
}

export function encrypt(value: unknown, k = key()): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", k, iv)
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64"))
    .join(".")
}

export function decrypt<T>(
  value: string | null | undefined,
  k = key()
): T | undefined {
  if (!value) return undefined
  const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64"))
  const decipher = createDecipheriv("aes-256-gcm", k, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(plain.toString("utf8")) as T
}

// Fails early on startup if the key is missing or malformed.
export function assertEncryptionKey() {
  key()
}

// Vault envelope: the value is encrypted with a random 32-byte key, and that key is
// encrypted with the master key. Rotating the master key only re-encrypts keyEnc.
export function seal(value: string) {
  const dek = randomBytes(32)
  return {
    valueEnc: encrypt(value, dek),
    keyEnc: encrypt(dek.toString("base64")),
  }
}

export function unseal(row: { valueEnc: string; keyEnc: string }) {
  const dek = Buffer.from(decrypt<string>(row.keyEnc) ?? "", "base64")
  return decrypt<string>(row.valueEnc, dek) ?? ""
}
