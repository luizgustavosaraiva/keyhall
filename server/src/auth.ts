import { apiKey } from "@better-auth/api-key"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
import { db } from "./db/index.js"
import { deviceLink } from "./device-link.js"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // Accounts are only created by the first-run setup (/api/setup) or admin:create.
    disableSignUp: true,
  },
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
