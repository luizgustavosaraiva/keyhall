import type { ReactNode } from "react"
import { Doorway } from "@/components/doorway"
import { type Locale, locales, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Frame for signed-out screens (sign-in and first run): the form on one side and the doorway
// scene on the other. On phones the scene is a band above the form.
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const { t, locale, setLocale } = useI18n()
  return (
    <div className="grid min-h-svh grid-rows-[auto_auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_1fr]">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <span className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
          <span className="font-brand text-lg">keyhall</span>
        </span>
        <div className="flex gap-1 text-sm">
          {locales.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLocale(l.id as Locale)}
              aria-pressed={locale === l.id}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                locale === l.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l.id.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <div className="relative mx-4 h-64 overflow-hidden rounded-2xl sm:mx-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:m-3 lg:h-auto lg:rounded-[20px]">
        <Doorway className="absolute inset-0 size-full" />
        <p className="absolute top-10 left-10 hidden max-w-sm text-[#eceae4] text-[1.75rem] leading-tight tracking-[-0.01em] lg:block">
          {t("auth.tagline")}
        </p>
      </div>
      <main className="flex items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-16">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-medium text-3xl tracking-[-0.01em]">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
