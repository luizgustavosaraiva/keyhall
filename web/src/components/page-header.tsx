import type { ReactNode } from "react"

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-semibold text-2xl sm:text-[1.75rem]">{title}</h1>
        {description && (
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-amber-600 dark:text-primary [&_svg]:size-6">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base">{title}</h2>
        <p className="max-w-sm text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  )
}
