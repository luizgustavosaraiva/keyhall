import type { ReactNode } from "react"
import { type Locale, locales, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Frame for signed-out screens (sign-in and first run): brand, card and language switch.
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const { locale, setLocale } = useI18n()
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] dark:bg-primary/10"
      />
      <div className="absolute top-4 right-4 flex rounded-full bg-muted/80 p-0.5 text-xs ring-1 ring-border">
        {locales.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLocale(l.id as Locale)}
            className={cn(
              "rounded-full px-2.5 py-1 font-medium transition-colors",
              locale === l.id
                ? "bg-card text-foreground shadow-[var(--shadow-surface)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l.id.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <img
            src="/favicon.svg"
            alt=""
            className="size-14 rounded-2xl shadow-[var(--shadow-raised)]"
          />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-semibold text-2xl">{title}</h1>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
        </div>
        <div className="surface w-full rounded-3xl p-6 shadow-[var(--shadow-raised)]">
          {children}
        </div>
        <span className="font-brand text-muted-foreground text-sm">
          keyhall
        </span>
      </div>
    </div>
  )
}
