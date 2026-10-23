import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const newPassword = String(form.get("new"))
    if (newPassword !== form.get("confirm")) {
      setError(t("password.mismatch"))
      return
    }
    setPending(true)
    setError(undefined)
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("current")),
      newPassword,
      // Other sessions (other browsers) are signed out; this one stays.
      revokeOtherSessions: true,
    })
    setPending(false)
    if (error) {
      setError(error.message ?? t("password.failed"))
      return
    }
    toast.success(t("password.changed"))
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setError(undefined)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("account.changePassword")}</DialogTitle>
          <DialogDescription>{t("password.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pw-current">
                {t("password.current")}
              </FieldLabel>
              <Input
                id="pw-current"
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pw-new">{t("password.new")}</FieldLabel>
              <Input
                id="pw-new"
                name="new"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pw-confirm">
                {t("password.confirm")}
              </FieldLabel>
              <Input
                id="pw-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("password.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
