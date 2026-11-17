import { type FormEvent, useEffect, useState } from "react"
import { AuthLayout } from "@/components/auth-layout"
import { door } from "@/components/doorway"
import { GoogleMark } from "@/components/google-mark"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"

export function Login({ google }: { google?: boolean }) {
  const { t } = useI18n()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  // Back from Google without a session (an account no keyhall user has): say why once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: first load only
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("error")) return
    setError(t("login.googleFailed"))
    door.fail()
    url.searchParams.delete("error")
    window.history.replaceState(null, "", url.pathname + url.search + url.hash)
  }, [])

  async function withGoogle() {
    setPending(true)
    setError(undefined)
    door.open()
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/",
    })
    if (error) {
      setPending(false)
      door.fail()
      setError(error.message ?? t("login.failed"))
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(undefined)
    door.open()
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) {
      door.fail()
      setError(error.message ?? t("login.failed"))
    }
  }

  return (
    <AuthLayout title={t("login.title")} description={t("login.description")}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{t("common.email")}</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t("common.password")}</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("login.pending") : t("login.submit")}
          </Button>
          {google && (
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
                onClick={withGoogle}
              >
                <GoogleMark className="size-4" />
                {t("login.google")}
              </Button>
            </>
          )}
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
