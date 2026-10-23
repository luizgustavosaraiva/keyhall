import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

export function CopyButton({
  value,
  label,
  variant = "ghost",
}: {
  value: string
  label?: string
  variant?: "ghost" | "outline" | "default"
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const icon = copied ? <CheckIcon /> : <CopyIcon />
  return label ? (
    <Button type="button" variant={variant} onClick={copy}>
      {icon}
      {copied ? t("common.copied") : label}
    </Button>
  ) : (
    <Button
      type="button"
      variant={variant}
      size="icon-sm"
      onClick={copy}
      aria-label={t("common.copy")}
      title={t("common.copy")}
    >
      {icon}
    </Button>
  )
}

// Code block with a copy button in the corner.
export function CodeBlock({ value }: { value: string }) {
  return (
    <div className="relative rounded-xl bg-muted/70 ring-1 ring-border ring-inset">
      <pre className="overflow-x-auto px-4 py-3 pr-12 font-mono text-xs leading-relaxed">
        {value}
      </pre>
      <div className="absolute top-1.5 right-1.5">
        <CopyButton value={value} />
      </div>
    </div>
  )
}
