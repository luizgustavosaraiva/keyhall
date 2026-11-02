import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// Segmented control (iOS style): options side by side on a track, one active.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  className?: string
  "aria-label"?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "bg-muted ring-border/60 grid auto-cols-fr grid-flow-col gap-1 rounded-xl p-1 ring-1 ring-inset",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          // biome-ignore lint/a11y/useSemanticElements: buttons with role radio are the segmented-control pattern
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              // Phones drop the icons and padding so the labels fit.
              "text-muted-foreground focus-visible:ring-ring/50 flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[0.8rem] font-medium transition-all outline-none focus-visible:ring-3 sm:px-3 [&_svg]:size-4 max-sm:[&_svg]:hidden",
              active
                ? "bg-card text-foreground shadow-[var(--shadow-surface)]"
                : "hover:text-foreground"
            )}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
