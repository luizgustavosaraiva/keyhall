import { type FormEvent, useEffect, useState } from "react"
import { AuthLayout } from "@/components/auth-layout"
import { door } from "@/components/doorway"
import { GoogleMark } from "@/components/google-mark"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"
import { Login } from "./login"

// The invitation code travels in the link's fragment (#invite=...), which never reaches a
// server log. It's kept for this tab so a sign-in round trip (Google) doesn't lose it.
const KEY = "keyhall:invite"

export function pendingInvite(): string | null {
  const match = window.location.hash.match(/^#invite=([\w-]+)$/)
  try {
    if (match) sessionStorage.setItem(KEY, match[1])
    return match?.[1] ?? sessionStorage.getItem(KEY)
  } catch {
    return match?.[1] ?? null
  }
}

function clearInvite() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
  window.history.replaceState(null, "", "/")
}

type Info = { email: string; org: string; existing: boolean; google: boolean }

async function accept(code: string, body: object) {
  const res = await fetch(`/api/invite/${code}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `error ${res.status}`)
}

export function Invite({
  code,
  session,
  onDone,
}: {
  code: string
  session: { email: string } | null
  onDone: () => void
}) {
  const { t } = useI18n()
  const [info, setInfo] = useState<Info>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetch(`/api/invite/${code}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(t("invite.invalid"))
        setInfo(await r.json())
      })
      .catch((err: Error) => setError(err.message))
  }, [code, t])

  async function run(step: () => Promise<void>) {
    setPending(true)
    setError(undefined)
    door.open()
    try {
      await step()
    } catch (err) {
      door.fail()
      setError((err as Error).message)
      setPending(false)
    }
  }

  // Someone with an account already (a member elsewhere) signs in first, then accepts.
  if (info?.existing && !session) return <Login google={info.google} />

  const wrongAccount =
    info && session && session.email.toLowerCase() !== info.email

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!info) return
    const form = new FormData(e.currentTarget)
    const name = String(form.get("name"))
    const password = String(form.get("password"))
    await run(async () => {
      await accept(code, { name, password })
      clearInvite()
      const { error } = await authClient.signIn.email({
        email: info.email,
        password,
      })
      if (error) throw new Error(error.message ?? t("login.failed"))
      onDone()
    })
  }

  async function withGoogle(form: HTMLFormElement | null) {
    const input = form?.elements.namedItem("name") as HTMLInputElement | null
    if (!input?.reportValidity()) return
    const name = input.value
    await run(async () => {
      await accept(code, { google: true, name })
      clearInvite()
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/",
      })
      if (error) throw new Error(error.message ?? t("login.googleFailed"))
    })
  }

  return (
    <AuthLayout
      title={info ? t("invite.title", { org: info.org }) : t("invite.loading")}
      description={info ? t("invite.description", { email: info.email }) : ""}
    >
      {!info ? (
        error && (
          <FieldGroup>
            <FieldError>{error}</FieldError>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                clearInvite()
                onDone()
              }}
            >
              {t("invite.leave")}
            </Button>
          </FieldGroup>
        )
      ) : wrongAccount ? (
        <FieldGroup>
          <p className="text-sm">
            {t("invite.wrongAccount", {
              current: session.email,
              email: info.email,
            })}
          </p>
          <Button
            size="lg"
            variant="outline"
            onClick={() => authClient.signOut()}
          >
            {t("account.signOut")}
          </Button>
        </FieldGroup>
      ) : session ? (
        <FieldGroup>
          {error && <FieldError>{error}</FieldError>}
          <Button
            size="lg"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await accept(code, {})
                clearInvite()
                onDone()
              })
            }
          >
            {t("invite.join", { org: info.org })}
          </Button>
        </FieldGroup>
      ) : (
        <form onSubmit={create}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="i-name">{t("common.name")}</FieldLabel>
              <Input id="i-name" name="name" autoComplete="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="i-password">
                {t("common.password")}
              </FieldLabel>
              <Input
                id="i-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <FieldDescription>{t("invite.passwordHint")}</FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" size="lg" disabled={pending}>
              {t("invite.create")}
            </Button>
            {info.google && (
              <>
                <div className="text-muted-foreground flex items-center gap-3 text-xs">
                  <span className="bg-border h-px flex-1" />
                  {t("login.or")}
                  <span className="bg-border h-px flex-1" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending}
                  onClick={(e) => withGoogle(e.currentTarget.form)}
                >
                  <GoogleMark className="size-4" />
                  {t("login.google")}
                </Button>
                <FieldDescription>
                  {t("invite.googleHint", { email: info.email })}
                </FieldDescription>
              </>
            )}
          </FieldGroup>
        </form>
      )}
    </AuthLayout>
  )
}
