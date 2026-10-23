import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const tones = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-amber-700 dark:text-warning",
  danger: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const

// Status pill with a colored dot.
export function StatusPill({
  tone,
  children,
  title,
  dot = true,
}: {
  tone: keyof typeof tones
  children: ReactNode
  title?: string
  dot?: boolean
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium text-xs",
        tones[tone]
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
