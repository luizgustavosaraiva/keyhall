import { ChevronRightIcon, MenuIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AppSidebar,
  type Page,
  type SidebarActions,
} from "@/components/app-sidebar"
import { ChangePasswordDialog } from "@/components/change-password"
import { useConfirm } from "@/components/confirm"
import { DevicesDialog } from "@/components/devices"
import { NameDialog, type NameRequest } from "@/components/name-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  api,
  type Connection,
  type Org,
  type Project,
  type Scope,
  type Secret,
  type Token,
  type View,
} from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"
import { Connections } from "./connections"
import { Scopes } from "./scopes"
import { Secrets } from "./secrets"
import { Tokens } from "./tokens"

// Messages after the OAuth return (/api/oauth/callback redirects to /?oauth=...).
function useOAuthNotice() {
  const { t } = useI18n()
  // biome-ignore lint/correctness/useExhaustiveDependencies: first load only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get("oauth")
    if (!result) return
    const name = params.get("conexao") ?? ""
    if (result === "ok") toast.success(t("oauth.ok", { name }))
    else if (result === "erro") toast.error(t("oauth.failed", { name }))
    else toast.error(t("oauth.expired"))
    window.history.replaceState(null, "", `/${window.location.hash}`)
  }, [])
}

const VIEW_KEY = "keyhall:view"
const pages: Page[] = ["connections", "scopes", "secrets", "tokens"]

function savedView(orgs: Org[]): View | null {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(VIEW_KEY)
  } catch {}
  const [orgId, projectId] = (saved ?? "").split("/")
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0]
  if (!org) return null
  return {
    org,
    project:
      org.projects.find((p) => p.id === projectId) ??
      (saved ? null : (org.projects[0] ?? null)),
  }
}

// Current page in the hash (#scopes), for the browser's back button and direct links.
const readPage = (): Page => {
  const hash = window.location.hash.slice(1) as Page
  return pages.includes(hash) ? hash : "connections"
}

function usePage() {
  const [page, setPageState] = useState<Page>(readPage)
  useEffect(() => {
    const onHash = () => setPageState(readPage())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const setPage = (next: Page) => {
    window.location.hash = next
    setPageState(next)
  }
  return [page, setPage] as const
}

export function Dashboard({
  user,
  sessionToken,
}: {
  user: { name: string; email: string }
  sessionToken: string
}) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [view, setViewState] = useState<View | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [scopes, setScopes] = useState<Scope[]>([])
  const [tokens, setTokens] = useState<Token[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [page, setPage] = usePage()
  const [menuOpen, setMenuOpen] = useState(false)
  const [naming, setNaming] = useState<NameRequest>()
  const [changingPassword, setChangingPassword] = useState(false)
  const [devices, setDevices] = useState(false)

  function setView(next: View) {
    setViewState(next)
    setMenuOpen(false)
    try {
      localStorage.setItem(
        VIEW_KEY,
        next.project ? `${next.org.id}/${next.project.id}` : next.org.id
      )
    } catch {}
  }

  const reloadOrgs = useCallback(async () => {
    const fresh = await api<Org[]>("/orgs")
    setOrgs(fresh)
    setViewState((current) => {
      const org = fresh.find((o) => o.id === current?.org.id)
      if (!org) return savedView(fresh)
      return {
        org,
        project:
          org.projects.find((p) => p.id === current?.project?.id) ?? null,
      }
    })
    return fresh
  }, [])

  const reload = useCallback(() => {
    reloadOrgs().catch((err: Error) => toast.error(err.message))
    Promise.all([
      api<Connection[]>("/connections"),
      api<Scope[]>("/scopes"),
      api<Token[]>("/tokens"),
      api<Secret[]>("/secrets"),
    ])
      .then(([c, s, tk, sec]) => {
        setConnections(c)
        setScopes(s)
        setTokens(tk)
        setSecrets(sec)
      })
      .catch((err: Error) => toast.error(err.message))
  }, [reloadOrgs])

  useEffect(reload, [reload])
  useOAuthNotice()

  // What belongs to the current view: one project, or every project of the organization.
  const inView = useMemo(() => {
    if (!view)
      return {
        connections: [],
        scopes: [],
        orgConnections: [],
        tokens: [],
        secrets: [],
        orgSecrets: [],
      }
    const projectIds = new Set(view.org.projects.map((p) => p.id))
    const orgConnections = connections.filter((c) =>
      projectIds.has(c.projectId)
    )
    const viewScopes = view.project
      ? scopes.filter((s) => s.projectId === view.project?.id)
      : scopes.filter((s) => s.orgId === view.org.id)
    // In a project view: tokens of the project and its scopes, plus the organization's.
    const viewTokens = tokens.filter((tk) => {
      if (tk.target.kind === "org") return tk.target.id === view.org.id
      if (tk.target.kind === "project")
        return view.project
          ? tk.target.id === view.project.id
          : projectIds.has(tk.target.id)
      return viewScopes.some((s) => s.id === tk.target.id)
    })
    const orgSecrets = secrets.filter((s) => projectIds.has(s.projectId))
    return {
      orgConnections,
      orgSecrets,
      secrets: view.project
        ? orgSecrets.filter((s) => s.projectId === view.project?.id)
        : orgSecrets,
      connections: view.project
        ? connections.filter((c) => c.projectId === view.project?.id)
        : orgConnections,
      scopes: viewScopes,
      tokens: viewTokens,
    }
  }, [view, connections, scopes, tokens, secrets])

  const actions: SidebarActions = {
    newOrg: () =>
      setNaming({
        title: t("org.new"),
        description: t("org.newDescription"),
        submit: t("common.create"),
        placeholder: "Acme",
        slug: {
          taken: (slug) => orgs.some((o) => o.slug === slug),
          hint: () => t("org.slugHint"),
        },
        onSubmit: async (name, slug) => {
          const created = await api<Org>("/orgs", { body: { name, slug } })
          const fresh = await reloadOrgs()
          const org = fresh.find((o) => o.id === created.id)
          if (org) setView({ org, project: null })
        },
      }),
    renameOrg: (org) =>
      setNaming({
        title: t("org.rename"),
        description: t("rename.description"),
        submit: t("common.save"),
        initial: org.name,
        onSubmit: async (name) => {
          await api(`/orgs/${org.id}`, { method: "PATCH", body: { name } })
          await reloadOrgs()
        },
      }),
    deleteOrg: async (org) => {
      const ok = await confirm({
        title: t("org.deleteTitle", { name: org.name }),
        description: t("org.deleteDescription"),
        confirm: t("common.delete"),
        destructive: true,
      })
      if (!ok) return
      try {
        await api(`/orgs/${org.id}`, { method: "DELETE" })
        const fresh = await reloadOrgs()
        if (fresh[0])
          setView({ org: fresh[0], project: fresh[0].projects[0] ?? null })
      } catch (err) {
        toast.error((err as Error).message)
      }
    },
    newProject: () => {
      if (!view) return
      setNaming({
        title: t("project.newIn", { org: view.org.name }),
        description: t("project.newDescription"),
        submit: t("common.create"),
        placeholder: "Marketing",
        slug: {
          taken: (slug) => view.org.projects.some((p) => p.slug === slug),
          hint: (slug) => t("project.slugHint", { slug: slug || "marketing" }),
        },
        onSubmit: async (name, slug) => {
          const created = await api<Project>(`/orgs/${view.org.id}/projects`, {
            body: { name, slug },
          })
          const fresh = await reloadOrgs()
          const org = fresh.find((o) => o.id === view.org.id) ?? view.org
          setView({ org, project: created })
        },
      })
    },
    renameProject: (project) =>
      setNaming({
        title: t("project.rename"),
        description: t("rename.description"),
        submit: t("common.save"),
        initial: project.name,
        onSubmit: async (name) => {
          await api(`/projects/${project.id}`, {
            method: "PATCH",
            body: { name },
          })
          await reloadOrgs()
        },
      }),
    deleteProject: async (project) => {
      const ok = await confirm({
        title: t("project.deleteTitle", { name: project.name }),
        description: t("project.deleteDescription"),
        confirm: t("common.delete"),
        destructive: true,
      })
      if (!ok) return
      try {
        await api(`/projects/${project.id}`, { method: "DELETE" })
        await reloadOrgs()
      } catch (err) {
        toast.error((err as Error).message)
      }
    },
    changePassword: () => setChangingPassword(true),
    devices: () => setDevices(true),
    signOut: () => authClient.signOut(),
  }

  if (!view) return null

  const sidebar = (
    <AppSidebar
      orgs={orgs}
      view={view}
      onViewChange={setView}
      page={page}
      onPageChange={(p) => {
        setPage(p)
        setMenuOpen(false)
      }}
      counts={{
        connections: inView.connections.length,
        scopes: inView.scopes.length,
        secrets: inView.secrets.length,
        tokens: inView.tokens.length,
      }}
      user={user}
      actions={actions}
    />
  )

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-sidebar-border border-r bg-sidebar lg:block">
        {sidebar}
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-72 bg-sidebar p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">keyhall</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="lg:pl-68">
        <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 lg:px-10">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label={t("nav.menu")}
          >
            <MenuIcon />
          </Button>
          <nav
            aria-label="breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-sm"
          >
            <span className="truncate text-muted-foreground">
              {view.org.name}
            </span>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate font-medium">
              {view.project?.name ?? t("project.all")}
            </span>
          </nav>
        </header>

        <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {page === "connections" && (
            <Connections
              view={view}
              connections={inView.connections}
              allConnections={connections}
              scopes={scopes}
              secrets={inView.orgSecrets}
              reload={reload}
            />
          )}
          {page === "scopes" && (
            <Scopes
              view={view}
              scopes={inView.scopes}
              allScopes={scopes}
              connections={inView.orgConnections}
              secrets={inView.orgSecrets}
              reload={reload}
            />
          )}
          {page === "secrets" && (
            <Secrets
              view={view}
              secrets={inView.secrets}
              allSecrets={secrets}
              connections={connections}
              reload={reload}
            />
          )}
          {page === "tokens" && (
            <Tokens
              view={view}
              tokens={inView.tokens}
              scopes={scopes}
              reload={reload}
            />
          )}
        </main>
      </div>

      <NameDialog request={naming} onClose={() => setNaming(undefined)} />
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
