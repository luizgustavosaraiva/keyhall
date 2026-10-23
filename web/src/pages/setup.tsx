import { type FormEvent, useState } from "react"
import { AuthLayout } from "@/components/auth-layout"
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
import { slugify } from "@/lib/slug"

// First run: creates the admin and names the organization. The code is in the server log.
export function Setup() {
  const { t } = useI18n()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email"))
    const password = String(form.get("password"))
    const orgName = String(form.get("organization"))
    setPending(true)
    setError(undefined)
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        name: form.get("name"),
        email,
        password,
        organization: { name: orgName, slug: slugify(orgName) || "default" },
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setPending(false)
      setError(data.error ?? `HTTP ${res.status}`)
      return
    }
    const { error } = await authClient.signIn.email({ email, password })
    setPending(false)
    if (error) setError(error.message ?? t("setup.signInFailed"))
  }

  return (
    <AuthLayout title={t("setup.title")} description={t("setup.description")}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="code">{t("setup.code")}</FieldLabel>
            <Input
              id="code"
              name="code"
              autoComplete="off"
              placeholder="XXXX-XXXX"
              className="font-mono uppercase tracking-widest"
              autoFocus
              required
            />
            <FieldDescription>{t("setup.codeHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="name">{t("setup.name")}</FieldLabel>
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">{t("common.email")}</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t("common.password")}</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="organization">{t("org.label")}</FieldLabel>
            <Input
              id="organization"
              name="organization"
              placeholder="Acme"
              required
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("common.working") : t("setup.submit")}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
