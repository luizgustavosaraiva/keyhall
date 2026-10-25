import { createHash } from "node:crypto"
import type { BetterAuthPlugin } from "better-auth"
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"
import * as z from "zod"

// Sign in on another device (a phone) by scanning a QR code in the panel. The signed-in admin
// asks for a one-time code; the device that opens the link gets a session of its own, so it
// can be signed out on its own later. Only a hash of the code is stored.

const TTL_SECONDS = 60
const identifier = (token: string) =>
  `device-link:${createHash("sha256").update(token).digest("hex")}`

export const deviceLink = () =>
  ({
    id: "device-link",
    endpoints: {
      createDeviceLink: createAuthEndpoint(
        "/device-link/create",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const { user } = ctx.context.session
          if (user.role !== "admin")
            throw new APIError("FORBIDDEN", { message: "access denied" })
          const token = generateRandomString(32)
          const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000)
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifier(token),
            value: user.id,
            expiresAt,
          })
          return ctx.json({ token, expiresAt })
        }
      ),
      redeemDeviceLink: createAuthEndpoint(
        "/device-link/redeem",
        { method: "POST", body: z.object({ token: z.string().min(1) }) },
        async (ctx) => {
          const invalid = new APIError("BAD_REQUEST", {
            message: "this code is invalid or has expired",
          })
          // Consumed on first use, valid or not.
          const found =
            await ctx.context.internalAdapter.consumeVerificationValue(
              identifier(ctx.body.token)
            )
          if (!found || found.expiresAt < new Date()) throw invalid
          const user = await ctx.context.internalAdapter.findUserById(
            found.value
          )
          if (!user) throw invalid
          const session = await ctx.context.internalAdapter.createSession(
            user.id
          )
          if (!session) throw invalid
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ ok: true })
        }
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path.startsWith("/device-link/"),
        window: 60,
        max: 10,
      },
    ],
  }) satisfies BetterAuthPlugin
