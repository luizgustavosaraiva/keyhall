import { type ReactNode, useRef } from "react"
import { Doorway, door } from "@/components/doorway"
import { type Locale, locales, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Frame for signed-out screens (sign-in and first run). The page is the wall: the doorway is cut
// into it beside the form (above it on phones), and its light answers what happens in the form.
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
  const slot = useRef<HTMLDivElement>(null)
  const isField = (e: { target: EventTarget }) =>
    e.target instanceof HTMLInputElement
  return (
    <div className="relative grid min-h-svh grid-rows-[auto_auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_1fr]">
      <Doorway slot={slot} />
      <header className="relative flex h-16 items-center justify-between px-4 sm:px-8">
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
      {/* Where the arch is drawn; the canvas behind the page reads its position. */}
      <div className="flex h-48 items-end justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:items-center">
        <div
          ref={slot}
          className="h-36 w-20 lg:mt-[14vh] lg:h-[46vh] lg:w-[26vh]"
        />
      </div>
      <main
        className="relative flex flex-col items-center gap-16 px-4 pt-12 pb-8 sm:px-8 lg:justify-center lg:pt-0"
        onFocusCapture={(e) => isField(e) && door.focus(true)}
        onBlurCapture={(e) => isField(e) && door.focus(false)}
        onKeyDown={(e) => {
          if (isField(e) && (e.key.length === 1 || e.key === "Backspace"))
            door.key()
        }}
      >
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-medium text-3xl tracking-[-0.01em]">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
        <p className="w-full max-w-sm text-muted-foreground text-sm lg:absolute lg:bottom-8">
          {t("auth.tagline")}
        </p>
      </main>
    </div>
  )
}
