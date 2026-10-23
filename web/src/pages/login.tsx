import { type FormEvent, useState } from "react"
import { AuthLayout } from "@/components/auth-layout"
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

export function Login() {
  const { t } = useI18n()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(undefined)
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) setError(error.message ?? t("login.failed"))
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
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
