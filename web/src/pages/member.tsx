import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  KeyRoundIcon,
  LayersIcon,
  LockKeyholeIcon,
  MenuIcon,
  PlugIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AccountMenu, NavItem, SectionLabel } from "@/components/app-sidebar"
import { ChangePasswordDialog } from "@/components/change-password"
import { DevicesDialog } from "@/components/devices"
import { Monogram } from "@/components/monogram"
import { EmptyState, PageHeader } from "@/components/page-header"
import { StatusPill } from "@/components/status-pill"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { meApi, type Reach, type Token } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"
import { Tokens } from "./tokens"

type MemberPage = "access" | "tokens"

const ORG_KEY = "keyhall:member-org"

const readPage = (): MemberPage =>
  window.location.hash === "#tokens" ? "tokens" : "access"

// What a member sees: what each organization granted them, and their own tokens within it.
export function MemberHome({
  user,
  sessionToken,
}: {
  user: { name: string; email: string }
  sessionToken: string
}) {
  const { t } = useI18n()
  const [reach, setReach] = useState<Reach[]>()
  const [tokens, setTokens] = useState<Token[]>([])
  const [orgId, setOrgIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ORG_KEY)
    } catch {
      return null
    }
  })
  const [page, setPageState] = useState<MemberPage>(readPage)
  const [menuOpen, setMenuOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [devices, setDevices] = useState(false)

  const reload = useCallback(() => {
    Promise.all([meApi<Reach[]>("/reach"), meApi<Token[]>("/tokens")])
      .then(([r, tk]) => {
        setReach(r)
        setTokens(tk)
      })
      .catch((err: Error) => toast.error(err.message))
  }, [])
  useEffect(reload, [reload])
  useEffect(() => {
    const onHash = () => setPageState(readPage())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  function setOrgId(id: string) {
    setOrgIdState(id)
    setMenuOpen(false)
    try {
      localStorage.setItem(ORG_KEY, id)
    } catch {}
  }
  function setPage(next: MemberPage) {
    window.location.hash = next
    setPageState(next)
    setMenuOpen(false)
  }

  if (!reach) return null
  const current = reach.find((r) => r.org.id === orgId) ?? reach[0]
  const scopeIds = new Set(current?.scopes.map((s) => s.id))
  // Tokens of this organization: its grants, or one of its scopes.
  const orgTokens = tokens.filter((tk) =>
    tk.target.kind === "member"
      ? tk.target.id === current?.memberId
      : scopeIds.has(tk.target.id)
  )
  const actions = {
    changePassword: () => setChangingPassword(true),
    devices: () => setDevices(true),
    signOut: () => authClient.signOut(),
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
        <span className="font-brand text-lg tracking-tight">keyhall</span>
      </div>
      {current && (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={reach.length < 2}
            className="bg-card ring-sidebar-border hover:bg-accent/40 focus-visible:ring-ring/50 disabled:hover:bg-card flex w-full items-center gap-2.5 rounded-xl p-2 text-left shadow-[var(--shadow-surface)] ring-1 transition-colors outline-none focus-visible:ring-3"
            aria-label={t("org.switch")}
          >
            <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium">
              {current.org.name[0]?.toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {current.org.name}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("member.role")}
              </span>
            </span>
            {reach.length > 1 && (
              <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            {reach.map((r) => (
              <DropdownMenuItem
                key={r.org.id}
                onClick={() => setOrgId(r.org.id)}
              >
                <Building2Icon />
                <span className="flex-1 truncate">{r.org.name}</span>
                {r.org.id === current.org.id && <CheckIcon />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <nav className="flex flex-col gap-0.5" aria-label={t("member.nav")}>
        <SectionLabel>{t("member.nav")}</SectionLabel>
        <NavItem
          active={page === "access"}
          icon={<ShieldCheckIcon />}
          label={t("member.access")}
          onClick={() => setPage("access")}
        />
        <NavItem
          active={page === "tokens"}
          icon={<KeyRoundIcon />}
          label={t("nav.tokens")}
          count={orgTokens.length}
          onClick={() => setPage("tokens")}
        />
      </nav>
      <div className="mt-auto">
        <AccountMenu user={user} actions={actions} />
      </div>
    </div>
  )

  return (
    <div className="min-h-svh">
      <aside className="border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-68 border-r lg:block">
        {sidebar}
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="bg-sidebar w-72 p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">keyhall</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="lg:pl-68">
        <header className="bg-background sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            onClick={() => setMenuOpen(true)}
            aria-label={t("nav.menu")}
          >
            <MenuIcon />
          </Button>
          <span className="truncate text-sm font-medium">
            {current?.org.name ?? "keyhall"}
          </span>
        </header>
        <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {!current ? (
            <EmptyState
              icon={<ShieldCheckIcon />}
              title={t("member.noneTitle")}
              description={t("member.noneDescription")}
            />
          ) : page === "access" ? (
            <Access reach={current} />
          ) : (
            <Tokens
              member={{ id: current.memberId, scopes: current.scopes }}
              tokens={orgTokens}
              scopes={[]}
              reload={reload}
            />
          )}
        </main>
      </div>

      <ChangePasswordDialog
        open={changingPassword}
        onOpenChange={setChangingPassword}
      />
      <DevicesDialog
        open={devices}
        onOpenChange={setDevices}
        currentToken={sessionToken}
      />
    </div>
  )
}

function Access({ reach }: { reach: Reach }) {
  const { t } = useI18n()
  const empty =
    !reach.connections.length && !reach.scopes.length && !reach.secrets.length
  return (
    <>
      <PageHeader
        title={t("member.accessTitle")}
        description={t("member.accessDescription", { org: reach.org.name })}
      />
      {empty ? (
        <EmptyState
          icon={<ShieldCheckIcon />}
          title={t("member.emptyTitle")}
          description={t("member.emptyDescription")}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {reach.connections.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <PlugIcon className="size-4" />
                {t("nav.connections")}
              </h2>
              <ul className="surface divide-y overflow-hidden">
                {reach.connections.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-4"
                  >
                    <Monogram name={c.name} className="size-10 rounded-lg" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="text-muted-foreground truncate font-mono text-xs">
                        {c.project.slug}__{c.slug}__…
                      </span>
                    </div>
                    <div className="flex basis-full items-center gap-2 max-sm:pl-13 sm:basis-auto">
                      <StatusPill tone="neutral" dot={false}>
                        {c.allowedTools === null
                          ? t("member.allTools")
                          : t("scopes.chipCount", { n: c.allowedTools.length })}
                      </StatusPill>
                      <StatusPill
                        tone={
                          c.status === "connected"
                            ? "success"
                            : c.status === "error"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {t(`status.${c.status}`)}
                      </StatusPill>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {reach.scopes.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <LayersIcon className="size-4" />
                {t("nav.scopes")}
              </h2>
              <p className="text-muted-foreground -mt-1 text-xs">
                {t("member.scopesHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                {reach.scopes.map((s) => (
                  <span
                    key={s.id}
                    className="bg-muted inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm"
                  >
                    <LayersIcon className="text-muted-foreground size-3.5" />
                    {s.name}
                  </span>
                ))}
              </div>
            </section>
          )}
          {reach.secrets.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <LockKeyholeIcon className="size-4" />
                {t("nav.secrets")}
              </h2>
              <ul className="surface divide-y overflow-hidden">
                {reach.secrets.map((x) => (
                  <li
                    key={x.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                      {x.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {x.project.name} ·{" "}
                      {x.agentAccess
                        ? t("scopes.secretAgents")
                        : t("scopes.secretRest")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}
