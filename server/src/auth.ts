import { apiKey } from "@better-auth/api-key"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
import { db } from "./db/index.js"
import { deviceLink } from "./device-link.js"

// Sign-in with Google, when the instance has an OAuth client for it. It never creates accounts:
// a Google account gets in only when its verified e-mail is a keyhall user's, or when that
// user linked it from the account menu (then any e-mail works).
const googleId = process.env.KEYHALL_GOOGLE_CLIENT_ID?.trim()
const googleSecret = process.env.KEYHALL_GOOGLE_CLIENT_SECRET?.trim()
export const googleLogin = !!(googleId && googleSecret)

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // Accounts are only created by the first-run setup (/api/setup) or admin:create.
    disableSignUp: true,
  },
  socialProviders: googleLogin
    ? {
        google: {
          clientId: googleId as string,
          clientSecret: googleSecret as string,
          disableSignUp: true,
          prompt: "select_account",
        },
      }
    : {},
  account: { accountLinking: { enabled: true, allowDifferentEmails: true } },
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") ?? [],
  plugins: [
    admin(),
    apiKey({
      defaultPrefix: "kh_",
      // Holds the token's tool mode (see access.ts).
      enableMetadata: true,
      // The plugin default is 10 requests a day; an MCP client makes several per minute.
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 },
    }),
    deviceLink(),
  ],
})
