import { cn } from "@/lib/utils"

// Initials of a service, in the neutral ramp: the names tell services apart, not colors.
export function Monogram({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const letters = name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium",
        className
      )}
    >
      {letters || "?"}
    </span>
  )
}
