import { useState } from "react"
import { Monogram } from "@/components/monogram"
import { cn } from "@/lib/utils"

// A catalog entry's official icon, served by keyhall (it downloads the vendor's icon once).
// Without one, or when it fails to load, the initials.
export function BrandIcon({
  icon,
  name,
  className,
}: {
  icon: string | null | undefined
  name: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  if (!icon || broken) return <Monogram name={name} className={className} />
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg",
        className
      )}
    >
      <img
        src={icon}
        alt=""
        className="size-6 rounded-sm object-contain"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </span>
  )
}
