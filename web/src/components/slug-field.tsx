import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"

// Read-only slug derived from the name. Warns when another record already uses it.
export function SlugField({
  id,
  slug,
  taken,
  hint,
}: {
  id: string
  slug: string
  taken: boolean
  hint: string
}) {
  const { t } = useI18n()
  return (
    <Field data-invalid={taken || undefined}>
      <FieldLabel htmlFor={id}>{t("slug.label")}</FieldLabel>
      <Input
        id={id}
        name="slug"
        value={slug}
        readOnly
        tabIndex={-1}
        aria-invalid={taken || undefined}
        placeholder={t("slug.placeholder")}
        className="bg-muted/50 font-mono text-muted-foreground"
      />
      {taken ? (
        <FieldError>{t("slug.taken")}</FieldError>
      ) : (
        <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}
