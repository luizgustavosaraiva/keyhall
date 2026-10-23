import { type FormEvent, useEffect, useState } from "react"
import { toast } from "sonner"
import { SlugField } from "@/components/slug-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"
import { slugify } from "@/lib/slug"

export type NameRequest = {
  title: string
  description?: string
  submit: string
  initial?: string
  placeholder?: string
  // Creation: shows the derived slug and warns if it's taken.
  slug?: { taken: (slug: string) => boolean; hint: (slug: string) => string }
  onSubmit: (name: string, slug: string) => Promise<unknown>
}

// Single-field dialog to create or rename an organization, project, connection or scope.
export function NameDialog({
  request,
  onClose,
}: {
  request?: NameRequest
  onClose: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (request) setName(request.initial ?? "")
  }, [request])
  const slug = slugify(name)
  const taken = !!request?.slug?.taken(slug)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!request) return
    setPending(true)
    try {
      await request.onSubmit(name.trim(), slug)
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.description && (
            <DialogDescription>{request.description}</DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nd-name">{t("common.name")}</FieldLabel>
              <Input
                id="nd-name"
                value={name}
                placeholder={request?.placeholder}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </Field>
            {request?.slug && (
              <SlugField
                id="nd-slug"
                slug={slug}
                taken={taken}
                hint={request.slug.hint(slug)}
              />
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                !name.trim() ||
                (!!request?.slug && (!slug || taken)) ||
                name.trim() === request?.initial
              }
            >
              {request?.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
