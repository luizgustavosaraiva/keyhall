import { cn } from "@/lib/utils"

// Stable color per name: the same service always gets the same hue.
const tones = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
]

const hash = (text: string) =>
  [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

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
        "flex size-10 shrink-0 items-center justify-center rounded-xl font-semibold text-sm",
        tones[hash(name) % tones.length],
        className
      )}
    >
      {letters || "?"}
    </span>
  )
}
