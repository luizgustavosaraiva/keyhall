import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react"
import { en } from "@/locales/en"
import { pt } from "@/locales/pt"

export type Locale = "en" | "pt"
export type MessageKey = keyof typeof en

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, pt }
export const locales: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "pt", label: "Português" },
]

const STORAGE_KEY = "keyhall:locale"

// Saved choice > browser language > English.
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "en" || saved === "pt") return saved
  } catch {}
  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en"
}

type Vars = Record<string, string | number>

type I18n = {
  locale: Locale
  setLocale: (locale: Locale) => void
  // "{n} tools" with { n: 3 } → "3 tools".
  t: (key: MessageKey, vars?: Vars) => string
  date: (value: string | null) => string
}

const I18nContext = createContext<I18n | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale)

  function setLocale(next: Locale) {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }

  useEffect(() => {
    document.documentElement.lang = locale === "pt" ? "pt-BR" : "en"
  }, [locale])

  const dict = dictionaries[locale]
  // Simple plural: with { n: 1 }, uses the "<key>_one" key if it exists.
  const t = (key: MessageKey, vars?: Vars) =>
    (
      (vars?.n === 1 && (dict as Record<string, string>)[`${key}_one`]) ||
      dict[key]
    ).replace(/\{(\w+)\}/g, (_, name: string) =>
      String(vars?.[name] ?? `{${name}}`)
    )
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—"

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, date }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}
