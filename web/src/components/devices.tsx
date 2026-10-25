import {
  LaptopIcon,
  LogOutIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { encode } from "uqr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"

type Session = {
  id: string
  token: string
  userAgent?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

// The panel opens the link and trades the code for a session (see useDeviceLink).
const LINK_PREFIX = "#link="

// "Safari on iPhone", from the user agent; good enough to tell devices apart.
function describeAgent(ua = "") {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : null
  return {
    label: [browser, os].filter(Boolean).join(" · ") || ua || "?",
    mobile: /iPhone|iPad|Android|Mobile/.test(ua),
  }
}

// Black on white whatever the theme: phone cameras read that best.
function QrCode({ value }: { value: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 })
  const path = data
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : "")))
    .join("")
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="size-52 rounded-xl bg-white"
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
    >
      <path d={path} fill="#000" />
    </svg>
  )
}

export function DevicesDialog({
  open,
  onOpenChange,
  currentToken,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentToken: string
}) {
  const { t, date } = useI18n()
  const [link, setLink] = useState<{ url: string; expiresAt: number }>()
  const [left, setLeft] = useState(0)
  const [sessions, setSessions] = useState<Session[]>([])
  const known = useRef<Set<string>>(undefined)

  const newLink = useCallback(async () => {
    setLink(undefined)
    const res = await fetch("/api/auth/device-link/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    if (!res.ok) {
      toast.error(t("devices.failed"))
      return
    }
    const { token, expiresAt } = (await res.json()) as {
      token: string
      expiresAt: string
    }
    setLink({
      url: `${window.location.origin}/${LINK_PREFIX}${token}`,
      expiresAt: new Date(expiresAt).getTime(),
    })
  }, [t])

  // A new session while the dialog is open is the phone that just scanned the code.
  const loadSessions = useCallback(async () => {
    const { data } = await authClient.listSessions()
    if (!data) return
    const ids = new Set(data.map((s) => s.id))
    if (known.current && data.some((s) => !known.current?.has(s.id))) {
      toast.success(t("devices.linked"))
      newLink()
    }
    known.current = ids
    setSessions(
      [...data].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    )
  }, [t, newLink])

  useEffect(() => {
    if (!open) {
      known.current = undefined
      return
    }
    newLink()
    loadSessions()
    const poll = setInterval(loadSessions, 4000)
    return () => clearInterval(poll)
  }, [open, newLink, loadSessions])

  useEffect(() => {
    if (!link) return
    const tick = () =>
      setLeft(Math.max(0, Math.round((link.expiresAt - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [link])

  async function revoke(s: Session) {
    const { error } = await authClient.revokeSession({ token: s.token })
    if (error) toast.error(error.message ?? t("devices.failed"))
    else loadSessions()
  }

  // A link to localhost won't open on the phone.
  const local = /^(localhost|127\.|\[?::1\]?$)/.test(window.location.hostname)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("devices.title")}</DialogTitle>
          <DialogDescription>{t("devices.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/50 p-5 ring-1 ring-border ring-inset">
          {link && left > 0 ? (
            <QrCode value={link.url} />
          ) : (
            <button
              type="button"
              onClick={newLink}
              className="flex size-52 flex-col items-center justify-center gap-2 rounded-xl bg-card text-muted-foreground text-sm ring-1 ring-border ring-inset hover:text-foreground"
            >
              <RefreshCwIcon className="size-5" />
              {link ? t("devices.expired") : t("common.loading")}
            </button>
          )}
          <p className="text-center text-muted-foreground text-xs tabular-nums">
            {link && left > 0
              ? t("devices.expiresIn", { n: left })
              : t("devices.oneUse")}
          </p>
          {local && (
            <p className="flex gap-2 rounded-xl bg-warning/12 px-3 py-2 text-amber-800 text-xs dark:text-warning">
              <TriangleAlertIcon className="size-4 shrink-0" />
              {t("devices.localhost")}
            </p>
          )}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
            {t("devices.signedIn")}
          </h3>
          <ul className="divide-y rounded-xl ring-1 ring-border ring-inset">
            {sessions.map((s) => {
              const agent = describeAgent(s.userAgent ?? "")
              const current = s.token === currentToken
              return (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  {agent.mobile ? (
                    <SmartphoneIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <LaptopIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-sm">
                      {agent.label}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {current
                        ? t("devices.thisDevice")
                        : t("devices.since", {
                            date: date(String(s.createdAt)),
                          })}
                    </span>
                  </div>
                  {!current && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      onClick={() => revoke(s)}
                      aria-label={t("devices.signOut")}
                      title={t("devices.signOut")}
                    >
                      <LogOutIcon />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  )
}

// On load: a #link=<code> URL (from the QR code) signs this browser in.
export async function redeemDeviceLink() {
  const { hash } = window.location
  if (!hash.startsWith(LINK_PREFIX)) return undefined
  // Out of the address bar and history before anything else.
  window.history.replaceState(null, "", "/")
  const res = await fetch("/api/auth/device-link/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: hash.slice(LINK_PREFIX.length) }),
  })
  return res.ok
}
