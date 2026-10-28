import {
  ArrowRightLeftIcon,
  ChevronDownIcon,
  GlobeIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import { Choice } from "@/components/choice"
import { useConfirm } from "@/components/confirm"
import { CopyButton } from "@/components/copy-button"
import { Monogram } from "@/components/monogram"
import { NameDialog, type NameRequest } from "@/components/name-dialog"
import { EmptyState, PageHeader } from "@/components/page-header"
import { SecretInput } from "@/components/secret-input"
import { Segmented } from "@/components/segmented"
import { SlugField } from "@/components/slug-field"
import { StatusPill } from "@/components/status-pill"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  api,
  type Connection,
  type ConnectResult,
  type Project,
  type Scope,
  type Secret,
  type Tool,
  type ToolParam,
  type View,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import {
  parseStdioConfig,
  type RemoteConfig,
  RemoteServerError,
  type StdioConfig,
  secretLikeArgs,
  stdioExample,
} from "@/lib/mcp-config"
import { slugify } from "@/lib/slug"

type Kind = Connection["kind"]

// What key fields need to offer vault secrets.
type Vault = { projectId: string; projects: Project[]; secrets: Secret[] }

// Empty fields aren't sent: when editing, they keep the current value.
function apiBody(form: FormData) {
  return Object.fromEntries(
    ["authHeader", "authPrefix", "secret", "specUrl"].flatMap((key) => {
      const value = form.get(key)
      // The prefix may be empty on purpose (e.g. a header with just the key).
      if (key === "authPrefix" && value !== null) return [[key, value]]
      return value ? [[key, value]] : []
    })
  )
}

function ApiFields({
  connection,
  vault,
}: {
  connection?: Connection
  vault: Vault
}) {
  const { t } = useI18n()
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="a-header">{t("api.header")}</FieldLabel>
          <Input
            id="a-header"
            name="authHeader"
            className="font-mono"
            defaultValue={connection?.authHeader ?? "Authorization"}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="a-prefix">{t("api.prefix")}</FieldLabel>
          <Input
            id="a-prefix"
            name="authPrefix"
            className="font-mono"
            defaultValue={
              connection ? (connection.authPrefix ?? "") : "Bearer "
            }
          />
        </Field>
      </div>
      <FieldDescription className="-mt-3">
        {t("api.prefixHint")}
      </FieldDescription>
      <Field>
        <FieldLabel htmlFor="a-secret">{t("api.key")}</FieldLabel>
        <SecretInput
          id="a-secret"
          name="secret"
          defaultValue={connection?.secretRef ?? ""}
          placeholder={
            connection?.hasSecret ? t("common.keepCurrent") : t("vault.keyHint")
          }
          required={!connection}
          {...vault}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="a-spec">{t("api.spec")}</FieldLabel>
        <Input
          id="a-spec"
          name="specUrl"
          type="url"
          defaultValue={connection?.specUrl ?? undefined}
          placeholder="https://…/openapi.json"
        />
        <FieldDescription>{t("api.specHint")}</FieldDescription>
      </Field>
    </>
  )
}

// Fixed headers of a remote MCP connection, from the name/value rows. An empty value when
// editing keeps the current one; a row left completely empty is ignored.
function headersBody(form: FormData) {
  const names = form.getAll("headerName").map((v) => String(v).trim())
  const values = form.getAll("headerValue").map(String)
  return Object.fromEntries(
    names.flatMap((name, i) => (name ? [[name, values[i] ?? ""]] : []))
  )
}

// Remote MCP options behind "Advanced": fixed headers, e.g. a key in Authorization for servers
// that don't use OAuth. One name/value row per header; "+" adds another.
function HeaderFields({
  connection,
  initial,
  vault,
}: {
  connection?: Connection
  // Headers from a pasted JSON (new connection).
  initial?: Record<string, string>
  vault: Vault
}) {
  const { t } = useI18n()
  const [rows, setRows] = useState(() => {
    const start = connection
      ? connection.headerNames.map((name) => ({
          name,
          value: connection.headerRefs[name] ?? "",
        }))
      : Object.entries(initial ?? {}).map(([name, value]) => ({ name, value }))
    return start.map((r) => ({ ...r, id: crypto.randomUUID() }))
  })
  const [open, setOpen] = useState(rows.length > 0)
  const add = () =>
    setRows((r) => [...r, { id: crypto.randomUUID(), name: "", value: "" }])

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="flex w-fit items-center gap-1.5 font-medium text-sm"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          if (!open && rows.length === 0) add()
        }}
      >
        {t("mcp.advanced")}
        <ChevronDownIcon
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 ring-1 ring-border ring-inset">
          <FieldLabel>{t("mcp.headers")}</FieldLabel>
          {rows.map((row) => {
            const saved = connection?.headerNames.includes(row.name)
            return (
              <div key={row.id} className="flex items-start gap-2">
                <Input
                  name="headerName"
                  aria-label={t("mcp.headerName")}
                  className="w-2/5 font-mono text-xs"
                  placeholder="Authorization"
                  defaultValue={row.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setRows((r) =>
                      r.map((x) => (x.id === row.id ? { ...x, name } : x))
                    )
                  }}
                />
                <div className="min-w-0 flex-1">
                  <SecretInput
                    id={`h-${row.id}`}
                    name="headerValue"
                    defaultValue={row.value}
                    placeholder={
                      saved ? t("common.keepCurrent") : "Bearer {{secret:…}}"
                    }
                    {...vault}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mt-0.5"
                  aria-label={t("mcp.removeHeader")}
                  title={t("mcp.removeHeader")}
                  onClick={() =>
                    setRows((r) => r.filter((x) => x.id !== row.id))
                  }
                >
                  <XIcon />
                </Button>
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={add}
          >
            <PlusIcon />
            {t("mcp.addHeader")}
          </Button>
          <FieldDescription>{t("mcp.headersHint")}</FieldDescription>
        </div>
      )}
    </div>
  )
}

// Body of a stdio connection: command and args from the JSON, variable values from the
// password fields (empty when editing = keep the current one).
function stdioBody(form: FormData, config: StdioConfig) {
  return {
    command: config.command,
    args: config.args,
    env: Object.fromEntries(
      Object.keys(config.env).map((k) => [
        k,
        String(form.get(`env:${k}`) ?? ""),
      ])
    ),
  }
}

// Local MCP server: paste the mcpServers JSON; each env variable becomes a password
// field, like the API key.
function StdioFields({
  connection,
  onChange,
  onRemote,
  vault,
}: {
  connection?: Connection
  onChange: (config: StdioConfig | undefined) => void
  // The pasted JSON is a remote server: switch to a remote MCP connection.
  onRemote?: (config: RemoteConfig) => void
  vault: Vault
}) {
  const { t } = useI18n()
  const [text, setText] = useState(() =>
    connection
      ? JSON.stringify(
          {
            command: connection.command,
            args: connection.args ?? [],
            env: Object.fromEntries(connection.envNames.map((n) => [n, ""])),
          },
          null,
          2
        )
      : ""
  )
  const parsed = useMemo(() => {
    if (!text.trim()) return {}
    try {
      return { config: parseStdioConfig(text) }
    } catch (err) {
      if (err instanceof RemoteServerError) return { remote: err.config }
      return { error: (err as Error).message }
    }
  }, [text])
  const { config, error, remote } = parsed as {
    config?: StdioConfig
    error?: string
    remote?: RemoteConfig
  }

  return (
    <>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="s-config">{t("stdio.config")}</FieldLabel>
        <Textarea
          id="s-config"
          className="max-h-72 min-h-40 font-mono text-xs"
          placeholder={stdioExample}
          value={text}
          aria-invalid={!!error}
          onChange={(e) => {
            setText(e.target.value)
            try {
              onChange(parseStdioConfig(e.target.value))
            } catch {
              onChange(undefined)
            }
          }}
          required
        />
        <FieldDescription>
          {error ??
            (config
              ? t("stdio.runs", {
                  command: [config.command, ...config.args].join(" "),
                })
              : t("stdio.hint"))}
        </FieldDescription>
      </Field>
      {remote && onRemote && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-sm ring-1 ring-border ring-inset">
          <span>{t("stdio.isRemote")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onRemote(remote)}
          >
            <GlobeIcon />
            {t("stdio.useRemote")}
          </Button>
        </div>
      )}
      {config && secretLikeArgs(config.args).length > 0 && (
        <p className="rounded-xl bg-warning/12 px-3 py-2 text-amber-800 text-xs dark:text-warning">
          {t("stdio.secretInArgs")}
        </p>
      )}
      {config && Object.keys(config.env).length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 ring-1 ring-border ring-inset">
          {Object.entries(config.env).map(([key, value]) => (
            <Field key={`${key}:${value}`}>
              <FieldLabel htmlFor={`env-${key}`} className="font-mono text-xs">
                {key}
              </FieldLabel>
              <SecretInput
                id={`env-${key}`}
                name={`env:${key}`}
                defaultValue={value || connection?.envRefs[key] || ""}
                placeholder={
                  connection?.envNames.includes(key)
                    ? t("common.keepCurrent")
                    : t("vault.keyHint")
                }
                required={!connection?.envNames.includes(key)}
                {...vault}
              />
            </Field>
          ))}
          <FieldDescription>{t("stdio.envHint")}</FieldDescription>
        </div>
      )}
    </>
  )
}

const PAGE = 60

const typeLabel = (p: ToolParam) =>
  p.enum
    ? p.enum.map((v) => JSON.stringify(v)).join(" | ")
    : Array.isArray(p.type)
      ? p.type.join(" | ")
      : p.type === "array" && p.items?.type
        ? `${p.items.type}[]`
        : (p.type ?? "any")

// Tool detail: full description and parameters.
function ToolDetail({ tool, onClose }: { tool?: Tool; onClose: () => void }) {
  const { t } = useI18n()
  const params = Object.entries(tool?.inputSchema?.properties ?? {})
  const required = new Set(tool?.inputSchema?.required ?? [])
  return (
    <Dialog open={!!tool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 break-all pr-8 font-mono">
            {tool?.name}
            {tool && <CopyButton value={tool.name} />}
          </DialogTitle>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {tool?.description || t("tools.noDescription")}
        </p>
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
            {t("tools.params")}
          </h3>
          {params.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("tools.noParams")}
            </p>
          ) : (
            <ul className="divide-y rounded-xl ring-1 ring-border ring-inset">
              {params.map(([name, p]) => (
                <li key={name} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-medium font-mono text-[0.8rem]">
                      {name}
                    </code>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                      {typeLabel(p)}
                    </span>
                    {required.has(name) && (
                      <span className="text-[0.7rem] text-amber-700 dark:text-primary">
                        {t("tools.required")}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                      {p.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}

// A connection's tools: opens at once showing the loading state, renders incrementally
// while scrolling (servers like Dokploy have hundreds) and opens the detail on click.
function ToolsDialog({
  connection,
  tools,
  error,
  onClose,
}: {
  connection?: Connection
  // undefined while loading.
  tools?: Tool[]
  error?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE)
  const [detail, setDetail] = useState<Tool>()
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null)
  const q = query.trim().toLowerCase()
  const matching = (tools ?? []).filter(
    (tool) =>
      !q ||
      tool.name.toLowerCase().includes(q) ||
      tool.description?.toLowerCase().includes(q)
  )
  const shown = matching.slice(0, limit)

  // One more page when the end of the list comes into view.
  useEffect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinel])

  return (
    <>
      <Dialog
        open={!!connection}
        onOpenChange={(open) => {
          if (!open) {
            setQuery("")
            setLimit(PAGE)
            onClose()
          }
        }}
      >
        <DialogContent className="flex h-[min(85svh,860px)] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {t("tools.of", { name: connection?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {tools
                ? q
                  ? t("tools.matching", {
                      n: matching.length,
                      total: tools.length,
                    })
                  : t("tools.count", { n: tools.length })
                : t("tools.loadingFrom", { name: connection?.name ?? "" })}{" "}
              · <span className="font-mono">{connection?.slug}__…</span>
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE)
              }}
              placeholder={t("tools.search")}
              className="pl-9"
              disabled={!tools}
            />
          </div>
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
            {error ? (
              <p className="py-10 text-center text-destructive text-sm">
                {error}
              </p>
            ) : !tools ? (
              <div className="flex flex-col gap-4" aria-busy="true">
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2Icon className="size-4 animate-spin" />
                  {t("tools.loadingHint")}
                </p>
                <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: esqueleto fixo
                      key={i}
                      className="flex h-[92px] flex-col gap-2 rounded-xl bg-muted/45 p-3 ring-1 ring-border/70 ring-inset"
                    >
                      <span className="h-3.5 w-1/3 animate-pulse rounded bg-muted-foreground/15" />
                      <span className="h-3 w-full animate-pulse rounded bg-muted-foreground/10" />
                      <span className="h-3 w-4/5 animate-pulse rounded bg-muted-foreground/10" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground text-sm">
                {t("tools.none")}
              </p>
            ) : (
              <>
                <ul className="grid gap-2 pb-1 md:grid-cols-2 xl:grid-cols-3">
                  {shown.map((tool) => (
                    <li key={tool.name}>
                      <button
                        type="button"
                        onClick={() => setDetail(tool)}
                        className="flex h-full w-full flex-col gap-1 rounded-xl bg-muted/45 p-3 text-left outline-none ring-1 ring-border/70 ring-inset transition-colors hover:bg-muted hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="break-all font-medium font-mono text-[0.8rem]">
                          {tool.name}
                        </span>
                        {tool.description && (
                          <span className="line-clamp-3 text-muted-foreground text-xs leading-relaxed">
                            {tool.description}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {shown.length < matching.length && (
                  <div
                    ref={setSentinel}
                    className="flex justify-center py-4 text-muted-foreground"
                  >
                    <Loader2Icon className="size-4 animate-spin" />
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ToolDetail tool={detail} onClose={() => setDetail(undefined)} />
    </>
  )
}

export function Connections({
  view,
  connections,
  allConnections,
  scopes,
  secrets,
  reload,
}: {
  view: View
  connections: Connection[]
  allConnections: Connection[]
  scopes: Scope[]
  // The organization's secrets, for references in key fields.
  secrets: Secret[]
  reload: () => void
}) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const projects = view.org.projects
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? "?"
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  // In the organization view the form asks for the project; inside a project, it's that one.
  const [projectId, setProjectId] = useState("")
  const targetProject = view.project?.id ?? projectId
  const slug = slugify(name)
  // Slugs are unique within a project.
  const slugTaken = allConnections.some(
    (c) => c.projectId === targetProject && c.slug === slug
  )
  const [moving, setMoving] = useState<Connection>()
  const [kind, setKind] = useState<Kind>("mcp")
  const [editing, setEditing] = useState<Connection>()
  const [stdio, setStdio] = useState<StdioConfig>()
  // Remote server pasted in the Local tab: fills the remote MCP form.
  const [draft, setDraft] = useState<RemoteConfig>()
  const [naming, setNaming] = useState<NameRequest>()
  const [busy, setBusy] = useState<string>()
  // What the instance allows (KEYHALL_ALLOW_STDIO).
  const [settings, setSettings] = useState({ stdio: true })
  useEffect(() => {
    api<{ stdio: boolean }>("/settings").then(setSettings, () => {})
  }, [])
  const [tools, setTools] = useState<{
    conn: Connection
    list?: Tool[]
    error?: string
  }>()

  const vaultFor = (pid: string): Vault => ({
    projectId: pid,
    projects,
    secrets,
  })

  const kindLabel: Record<Kind, string> = {
    mcp: t("kind.mcp"),
    api: t("kind.api"),
    stdio: t("kind.stdio"),
  }
  const kindDescription: Record<Kind, string> = {
    mcp: t("kind.mcpDescription"),
    api: t("kind.apiDescription"),
    stdio: t("kind.stdioDescription"),
  }
  const statusLabel = {
    connected: t("status.connected"),
    pending: t("status.pending"),
    error: t("status.error"),
  }

  function openCreate() {
    setName("")
    setStdio(undefined)
    setDraft(undefined)
    setKind("mcp")
    setProjectId(projects[0]?.id ?? "")
    setCreating(true)
  }

  // Reconnecting can take a few seconds (OAuth discovery, starting the local process): the card
  // and a toast show progress until the result or the redirect.
  async function connect(conn: Connection) {
    setBusy(conn.id)
    const toastId = toast.loading(
      conn.kind === "stdio"
        ? t("connections.restarting", { name: conn.name })
        : t("connections.connecting", { name: conn.name })
    )
    const result = await api<ConnectResult>(`/connections/${conn.id}/connect`, {
      method: "POST",
    }).catch((err: Error) => ({ status: "error" as const, error: err.message }))
    if (result.status === "authorize") {
      toast.loading(t("connections.redirecting", { name: conn.name }), {
        id: toastId,
      })
      window.location.href = result.authorizationUrl
      return
    }
    setBusy(undefined)
    if (result.status === "connected")
      toast.success(t("connections.connected", { name: conn.name }), {
        id: toastId,
      })
    else toast.error(result.error, { id: toastId })
    reload()
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy("create")
    try {
      const created = await api<Connection>("/connections", {
        body: {
          kind,
          projectId: targetProject,
          name: form.get("name"),
          slug: form.get("slug"),
          ...(kind !== "stdio" && { url: form.get("url") }),
          ...(kind === "mcp" && { headers: headersBody(form) }),
          ...(kind === "api" && apiBody(form)),
          ...(kind === "stdio" && stdio && stdioBody(form, stdio)),
        },
      })
      if (created.status === "error" && created.lastError)
        toast.error(created.lastError)
      setCreating(false)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setBusy("update")
    try {
      const form = new FormData(e.currentTarget)
      const updated = await api<Connection>(`/connections/${editing.id}`, {
        method: "PATCH",
        body:
          editing.kind === "stdio"
            ? stdio && stdioBody(form, stdio)
            : editing.kind === "mcp"
              ? { headers: headersBody(form) }
              : apiBody(form),
      })
      if (updated.status === "error" && updated.lastError)
        toast.error(updated.lastError)
      else toast.success(t("connections.updated", { name: editing.name }))
      setEditing(undefined)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  // Opens the dialog at once and loads afterwards; ignores the response if it was closed.
  async function showTools(conn: Connection) {
    setTools({ conn })
    try {
      const list = await api<Tool[]>(`/connections/${conn.id}/tools`)
      setTools((cur) => (cur?.conn.id === conn.id ? { conn, list } : cur))
    } catch (err) {
      const error = (err as Error).message
      setTools((cur) => (cur?.conn.id === conn.id ? { conn, error } : cur))
    }
  }

  async function move(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!moving) return
    const to = String(new FormData(e.currentTarget).get("projectId"))
    try {
      await api(`/connections/${moving.id}/project`, {
        method: "PUT",
        body: { projectId: to },
      })
      toast.success(
        t("connections.moved", { name: moving.name, project: projectName(to) })
      )
      setMoving(undefined)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function remove(conn: Connection) {
    const inScopes = scopes.filter((s) => s.connectionIds.includes(conn.id))
    const ok = await confirm({
      title: t("connections.deleteTitle", { name: conn.name }),
      description: inScopes.length
        ? t("connections.deleteInScopes", {
            scopes: inScopes.map((s) => s.name).join(", "),
          })
        : t("connections.deleteDescription"),
      confirm: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api(`/connections/${conn.id}`, { method: "DELETE" })
    reload()
  }

  function rename(conn: Connection) {
    setNaming({
      title: t("connections.rename"),
      description: t("rename.description"),
      submit: t("common.save"),
      initial: conn.name,
      onSubmit: async (newName) => {
        await api(`/connections/${conn.id}`, {
          method: "PATCH",
          body: { name: newName },
        })
        reload()
      },
    })
  }

  function edit(conn: Connection) {
    // Starts from the saved config: saving without touching the JSON keeps everything.
    setStdio(
      conn.kind === "stdio"
        ? {
            command: conn.command ?? "",
            args: conn.args ?? [],
            env: Object.fromEntries(conn.envNames.map((n) => [n, ""])),
          }
        : undefined
    )
    setEditing(conn)
  }

  const kinds: { value: Kind; label: string; icon: ReactNode }[] = [
    { value: "mcp", label: kindLabel.mcp, icon: <GlobeIcon /> },
    { value: "api", label: kindLabel.api, icon: <PlugIcon /> },
    ...(settings.stdio
      ? [
          {
            value: "stdio" as const,
            label: kindLabel.stdio,
            icon: <TerminalIcon />,
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title={t("connections.title")}
        description={t("connections.description")}
        action={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t("connections.new")}
          </Button>
        }
      />

      {connections.length === 0 ? (
        <EmptyState
          icon={<PlugIcon />}
          title={t("connections.emptyTitle")}
          description={t("connections.emptyDescription")}
          action={
            <Button onClick={openCreate} variant="outline">
              <PlusIcon />
              {t("connections.new")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.map((conn) => (
            <article
              key={conn.id}
              className="surface flex min-w-0 flex-col gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-raised)]"
            >
              <div className="flex items-start gap-3">
                <Monogram name={conn.name} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h3 className="truncate font-semibold">{conn.name}</h3>
                  <p className="truncate font-mono text-muted-foreground text-xs">
                    {view.project ? "" : `${projectName(conn.projectId)} · `}
                    {conn.slug}
                    <span className="font-sans"> · {kindLabel[conn.kind]}</span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="-mt-1 -mr-2 rounded-full"
                        aria-label={t("common.more")}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => rename(conn)}>
                      <PencilIcon />
                      {t("common.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => edit(conn)}>
                      <SettingsIcon />
                      {t("connections.configure")}
                    </DropdownMenuItem>
                    {conn.kind !== "api" && (
                      <DropdownMenuItem onClick={() => connect(conn)}>
                        <RefreshCwIcon />
                        {conn.kind === "stdio"
                          ? t("connections.restart")
                          : t("connections.reconnect")}
                      </DropdownMenuItem>
                    )}
                    {projects.length > 1 && (
                      <DropdownMenuItem onClick={() => setMoving(conn)}>
                        <ArrowRightLeftIcon />
                        {t("connections.move")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => remove(conn)}
                    >
                      <Trash2Icon />
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <p
                  className="truncate font-mono text-muted-foreground text-xs"
                  title={conn.url}
                >
                  {conn.url}
                </p>
                {conn.status === "error" && conn.lastError && (
                  <p
                    className="line-clamp-2 text-destructive text-xs"
                    title={conn.lastError}
                  >
                    {conn.lastError}
                  </p>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
                <div className="flex min-w-0 items-center">
                  {busy === conn.id ? (
                    <StatusPill tone="neutral" dot={false}>
                      <Loader2Icon className="size-3 animate-spin" />
                      {conn.kind === "stdio"
                        ? t("connections.restartingShort")
                        : t("connections.connectingShort")}
                    </StatusPill>
                  ) : (
                    <StatusPill
                      tone={
                        conn.status === "connected"
                          ? "success"
                          : conn.status === "error"
                            ? "danger"
                            : "warning"
                      }
                      title={conn.lastError ?? undefined}
                    >
                      {statusLabel[conn.status]}
                    </StatusPill>
                  )}
                </div>
                {conn.status === "connected" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => showTools(conn)}
                  >
                    <WrenchIcon />
                    {t("connections.tools")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === conn.id}
                    onClick={() =>
                      conn.kind === "api" ? edit(conn) : connect(conn)
                    }
                  >
                    {conn.kind === "api"
                      ? t("connections.configure")
                      : t("connections.connect")}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* New connection */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {view.project
                ? t("connections.newIn", { project: view.project.name })
                : t("connections.new")}
            </DialogTitle>
            <DialogDescription>{kindDescription[kind]}</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-5">
            <FieldGroup>
              <Segmented
                aria-label={t("connections.type")}
                value={kind}
                onChange={setKind}
                options={kinds}
              />
              {!view.project && (
                <Field>
                  <FieldLabel htmlFor="c-project">
                    {t("project.label")}
                  </FieldLabel>
                  <Choice
                    id="c-project"
                    value={projectId}
                    onChange={setProjectId}
                    options={projects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="c-name">{t("common.name")}</FieldLabel>
                <Input
                  id="c-name"
                  name="name"
                  placeholder="Cloudflare"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <SlugField
                id="c-slug"
                slug={slug}
                taken={slugTaken}
                hint={t("connections.slugHint", {
                  slug: slug || "cloudflare",
                })}
              />
              {kind !== "stdio" && (
                <Field>
                  <FieldLabel htmlFor="c-url">
                    {kind === "mcp" ? t("connections.url") : t("api.baseUrl")}
                  </FieldLabel>
                  <Input
                    key={draft?.url}
                    id="c-url"
                    name="url"
                    type="url"
                    defaultValue={kind === "mcp" ? draft?.url : undefined}
                    placeholder={
                      kind === "mcp"
                        ? "https://mcp.cloudflare.com/mcp"
                        : "https://api.example.com"
                    }
                    required
                  />
                </Field>
              )}
              {kind === "mcp" && (
                <HeaderFields
                  key={draft?.url}
                  initial={draft?.headers}
                  vault={vaultFor(targetProject)}
                />
              )}
              {kind === "api" && <ApiFields vault={vaultFor(targetProject)} />}
              {kind === "stdio" && (
                <StdioFields
                  vault={vaultFor(targetProject)}
                  onChange={(config) => {
                    setStdio(config)
                    // The server name in the JSON becomes the connection name, if there's none yet.
                    if (config?.name && !name) setName(config.name)
                  }}
                  onRemote={(config) => {
                    setDraft(config)
                    if (config.name && !name) setName(config.name)
                    setKind("mcp")
                  }}
                />
              )}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  busy === "create" ||
                  !slug ||
                  slugTaken ||
                  (kind === "stdio" && !stdio)
                }
              >
                {busy === "create" ? t("common.working") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog
        open={!!moving}
        onOpenChange={(open) => !open && setMoving(undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("connections.moveTitle", { name: moving?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("connections.moveDescription")}
            </DialogDescription>
          </DialogHeader>
          {moving && (
            <form onSubmit={move} className="flex flex-col gap-5">
              <Field>
                <FieldLabel htmlFor="m-project">
                  {t("connections.moveTarget")}
                </FieldLabel>
                <Choice
                  id="m-project"
                  name="projectId"
                  defaultValue={
                    projects.find((p) => p.id !== moving.projectId)?.id
                  }
                  options={projects
                    .filter((p) => p.id !== moving.projectId)
                    .map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMoving(undefined)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("connections.move")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Configure (API and stdio) */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>
              {editing?.kind === "stdio"
                ? t("stdio.editHint")
                : editing?.kind === "mcp"
                  ? t("mcp.editHint")
                  : t("api.editHint")}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={update} className="flex flex-col gap-5">
              <FieldGroup>
                {editing.kind === "stdio" ? (
                  <StdioFields
                    connection={editing}
                    onChange={setStdio}
                    vault={vaultFor(editing.projectId)}
                  />
                ) : editing.kind === "mcp" ? (
                  <HeaderFields
                    connection={editing}
                    vault={vaultFor(editing.projectId)}
                  />
                ) : (
                  <ApiFields
                    connection={editing}
                    vault={vaultFor(editing.projectId)}
                  />
                )}
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(undefined)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={busy === "update"}>
                  {busy === "update" ? t("common.working") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ToolsDialog
        connection={tools?.conn}
        tools={tools?.list}
        error={tools?.error}
        onClose={() => setTools(undefined)}
      />
      <NameDialog request={naming} onClose={() => setNaming(undefined)} />
    </>
  )
}
