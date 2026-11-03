import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
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
import { BrandIcon } from "@/components/brand-icon"
import { Choice } from "@/components/choice"
import { useConfirm } from "@/components/confirm"
import { CopyButton } from "@/components/copy-button"
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
  type Catalog,
  type CatalogEntry,
  type Connection,
  type ConnectResult,
  type NativeSpec,
  type Project,
  type Scope,
  type Secret,
  type Text,
  type Tool,
  type ToolParam,
  type View,
} from "@/lib/api"
import { type MessageKey, useI18n } from "@/lib/i18n"
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

// OAuth clients of a native plugin already in the project's vault: names N with every
// N_<suffix> secret present (GOOGLE → GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).
function savedClients(spec: NativeSpec, projectId: string, secrets: Secret[]) {
  const mine = secrets.filter((s) => s.projectId === projectId)
  const [first, ...rest] = spec.fields
  if (!first) return []
  const suffix = `_${first.vault}`
  return mine
    .filter((s) => s.name.endsWith(suffix))
    .map((s) => s.name.slice(0, -suffix.length))
    .filter(
      (n) =>
        n && rest.every((f) => mine.some((s) => s.name === `${n}_${f.vault}`))
    )
    .map((name) => ({
      name,
      usedBy: [
        ...new Set(
          spec.fields.flatMap(
            (f) =>
              mine.find((s) => s.name === `${name}_${f.vault}`)?.usedBy ?? []
          )
        ),
      ],
    }))
}

const refOf = (name: string, suffix: string) => `{{secret:${name}_${suffix}}}`

// Client name a connection points at, when all its fields reference one saved client.
function clientOf(spec: NativeSpec, connection?: Connection) {
  const fields = connection?.native?.fields
  const [first] = spec.fields
  if (!fields || !first) return undefined
  const ref = fields[first.name]?.match(/^\{\{secret:([A-Za-z0-9_]+)\}\}$/)?.[1]
  const name = ref?.slice(0, -(first.vault.length + 1))
  return name &&
    spec.fields.every((f) => fields[f.name] === refOf(name, f.vault))
    ? name
    : undefined
}

const VAULT_NAME = /^[A-Z][A-Z0-9_]*$/

// Fields of a native connection, all as vault references. A new client is saved in the vault
// first (one secret per field), so the next connection can pick it.
async function nativeFieldsFrom(
  form: FormData,
  spec: NativeSpec,
  projectId: string,
  secrets: Secret[],
  t: (key: MessageKey, vars?: Record<string, string>) => string
) {
  const isNew = form.get("client-mode") === "new"
  const name = String(form.get(isNew ? "client-name" : "client") ?? "")
    .trim()
    .toUpperCase()
  if (!VAULT_NAME.test(name)) throw new Error(t("native.badName"))
  if (isNew) {
    const taken = spec.fields
      .map((f) => `${name}_${f.vault}`)
      .filter((n) =>
        secrets.some((s) => s.projectId === projectId && s.name === n)
      )
    if (taken.length)
      throw new Error(t("native.nameTaken", { name: taken.join(", ") }))
    for (const f of spec.fields)
      await api("/secrets", {
        body: {
          projectId,
          name: `${name}_${f.vault}`,
          value: String(form.get(`field-${f.name}`) ?? "").trim(),
          description: f.label.en,
        },
      })
  }
  return Object.fromEntries(
    spec.fields.map((f) => [f.name, refOf(name, f.vault)])
  )
}

// OAuth client of a native connection: one already saved in the vault, or a new one that is
// saved there. Plus the redirect URI and the provider's setup links.
function NativeFields({
  spec,
  connection,
  projectId,
  secrets,
  guide,
  links,
}: {
  spec: NativeSpec
  connection?: Connection
  projectId: string
  secrets: Secret[]
  guide?: string
  links?: { label: Text; url: string }[]
}) {
  const { t, locale } = useI18n()
  const saved = savedClients(spec, projectId, secrets)
  const [mode, setMode] = useState<"saved" | "new">(
    saved.length ? "saved" : "new"
  )
  const [client, setClient] = useState(
    clientOf(spec, connection) ?? saved[0]?.name ?? ""
  )
  // A free default name: GOOGLE, then GOOGLE_2…
  const suggested = (() => {
    const taken = new Set(saved.map((c) => c.name))
    if (!taken.has(spec.vaultName)) return spec.vaultName
    let i = 2
    while (taken.has(`${spec.vaultName}_${i}`)) i++
    return `${spec.vaultName}_${i}`
  })()
  const redirect = `${window.location.origin}/api/oauth/callback`
  const link = (href: string, label: string) => (
    <a
      key={href}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
    >
      {label}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
  return (
    <>
      <input type="hidden" name="client-mode" value={mode} />
      <Field>
        <FieldLabel>{t("native.client")}</FieldLabel>
        {saved.length > 0 && (
          <Segmented
            aria-label={t("native.client")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "saved", label: t("native.savedClient") },
              { value: "new", label: t("native.newClient") },
            ]}
          />
        )}
        {mode === "saved" ? (
          <>
            <Choice
              id="n-client"
              name="client"
              value={client}
              onChange={setClient}
              options={saved.map((c) => ({
                value: c.name,
                label: c.usedBy.length
                  ? t("native.usedBy", {
                      name: c.name,
                      by: c.usedBy.join(", "),
                    })
                  : c.name,
              }))}
            />
            <FieldDescription>{t("native.savedHint")}</FieldDescription>
          </>
        ) : (
          <FieldDescription>{t("native.newHint")}</FieldDescription>
        )}
      </Field>
      {mode === "new" && (
        <>
          <Field>
            <FieldLabel htmlFor="n-name">{t("native.clientName")}</FieldLabel>
            <Input
              id="n-name"
              name="client-name"
              className="font-mono text-xs uppercase"
              defaultValue={suggested}
              pattern="[A-Za-z][A-Za-z0-9_]*"
              required
            />
            <FieldDescription>
              {t("native.clientNameHint", {
                names: spec.fields.map((f) => `_${f.vault}`).join(", "),
              })}
            </FieldDescription>
          </Field>
          {spec.fields.map((f) => (
            <Field key={f.name}>
              <FieldLabel htmlFor={`n-${f.name}`}>{f.label[locale]}</FieldLabel>
              <Input
                id={`n-${f.name}`}
                name={`field-${f.name}`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                className="font-mono text-xs"
                placeholder={f.placeholder}
                required
              />
            </Field>
          ))}
        </>
      )}
      <Field>
        <FieldLabel htmlFor="n-redirect">{t("native.redirect")}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="n-redirect"
            readOnly
            value={redirect}
            className="font-mono text-xs"
          />
          <CopyButton value={redirect} />
        </div>
        <FieldDescription>{t("native.redirectHint")}</FieldDescription>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {link(spec.consoleUrl, t("native.console"))}
          {links?.map((l) => link(l.url, l.label[locale]))}
          {guide && link(guide, t("native.guide"))}
        </div>
      </Field>
      {connection && <FieldDescription>{t("native.reauth")}</FieldDescription>}
    </>
  )
}

// The key a catalog entry asks for: a header of a remote server or a variable of a local one.
function EntryKeyField({
  entry,
  vault,
}: {
  entry: CatalogEntry
  vault: Vault
}) {
  const { t, locale } = useI18n()
  const { connect } = entry
  if (connect.kind === "native" || !("key" in connect) || !connect.key)
    return (
      <p className="text-muted-foreground text-sm">
        {t("catalog.oauthHint", { name: entry.name })}
      </p>
    )
  const key = connect.key
  return (
    <Field>
      <FieldLabel htmlFor="e-key">{key.label[locale]}</FieldLabel>
      <SecretInput
        id="e-key"
        name="key"
        placeholder={key.placeholder ?? t("vault.keyHint")}
        required
        {...vault}
      />
      {key.url && (
        <FieldDescription>
          <a
            href={key.url}
            target="_blank"
            rel="noreferrer"
            className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
          >
            {t("catalog.getKey")}
            <ExternalLinkIcon className="size-3" />
          </a>
        </FieldDescription>
      )}
    </Field>
  )
}

// Body of a connection made from a catalog entry: the entry's address or command, plus what
// the admin typed.
function entryBody(
  entry: CatalogEntry,
  form: FormData,
  fields: Record<string, string>
) {
  const { connect } = entry
  const key = String(form.get("key") ?? "")
  if (connect.kind === "mcp")
    return {
      kind: "mcp",
      url: connect.url,
      headers: connect.key
        ? { [connect.key.header]: connect.key.prefix + key }
        : {},
    }
  if (connect.kind === "stdio")
    return {
      kind: "stdio",
      command: connect.command,
      args: connect.args,
      env: { [connect.key.env]: key },
    }
  return { kind: "native", native: connect.plugin, fields }
}

const nativeLinks = (entry?: CatalogEntry) =>
  entry?.connect.kind === "native" ? entry.connect.links : undefined

const PILL = "h-5 shrink-0 gap-1 px-2 text-[11px]"

// How many connections of the project use an entry: connected ones in green, the rest
// (waiting for sign-in, or with an error) in amber.
function InUse({
  entry,
  connections,
}: {
  entry: CatalogEntry
  connections: Connection[]
}) {
  const { t } = useI18n()
  const mine = connections.filter((c) => fromEntry(entry, c))
  if (!mine.length) return null
  const ok = mine.filter((c) => c.status === "connected").length
  const names = mine.map((c) => c.name).join(", ")
  return ok ? (
    <StatusPill tone="success" title={names} className={PILL}>
      {t("catalog.connected", { n: ok })}
    </StatusPill>
  ) : (
    <StatusPill tone="warning" title={names} className={PILL}>
      {t("catalog.pending", { n: mine.length })}
    </StatusPill>
  )
}

// Grid of catalog entries, with a search box and the custom connection first.
// Connections that came from a catalog entry: created from it, or, for those made with the
// custom form before the catalog existed, the same remote MCP address.
const fromEntry = (entry: CatalogEntry, conn: Connection) =>
  conn.plugin === entry.slug ||
  (!conn.plugin &&
    conn.kind === "mcp" &&
    entry.connect.kind === "mcp" &&
    conn.url.replace(/\/$/, "") === entry.connect.url.replace(/\/$/, ""))

function CatalogPicker({
  entries,
  connections,
  onPick,
  onCustom,
}: {
  entries: CatalogEntry[]
  // The project's connections, to mark entries already in use.
  connections: Connection[]
  onPick: (entry: CatalogEntry) => void
  onCustom: () => void
}) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = q
    ? entries.filter((e) =>
        `${e.name} ${e.tagline[locale]} ${e.slug}`.toLowerCase().includes(q)
      )
    : entries
  const tile =
    "hover:bg-muted/60 hover:border-foreground/15 flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors"
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("catalog.search")}
          className="pl-9"
          aria-label={t("catalog.search")}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={tile} onClick={onCustom}>
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
            <PlusIcon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {t("catalog.custom")}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {t("catalog.customDescription")}
            </span>
          </span>
        </button>
        {shown.map((e) => (
          <button
            key={e.slug}
            type="button"
            className={tile}
            onClick={() => onPick(e)}
          >
            <BrandIcon icon={e.icon} name={e.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{e.name}</span>
                <InUse entry={e} connections={connections} />
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {e.tagline[locale]}
              </span>
            </span>
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="text-muted-foreground text-center text-sm">
          {t("catalog.empty")}
        </p>
      )}
    </div>
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
        className="flex w-fit items-center gap-1.5 text-sm font-medium"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          if (!open && rows.length === 0) add()
        }}
      >
        {t("mcp.advanced")}
        <ChevronDownIcon
          className={`text-muted-foreground size-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="bg-muted/50 ring-border flex flex-col gap-3 rounded-xl p-4 ring-1 ring-inset">
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
        <div className="bg-muted/50 ring-border flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ring-1 ring-inset">
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
        <p className="bg-warning/12 dark:text-warning rounded-xl px-3 py-2 text-xs text-amber-800">
          {t("stdio.secretInArgs")}
        </p>
      )}
      {config && Object.keys(config.env).length > 0 && (
        <div className="bg-muted/50 ring-border flex flex-col gap-3 rounded-xl p-4 ring-1 ring-inset">
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
          <DialogTitle className="flex items-center gap-2 pr-8 font-mono break-all">
            {tool?.name}
            {tool && <CopyButton value={tool.name} />}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {tool?.description || t("tools.noDescription")}
        </p>
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("tools.params")}
          </h3>
          {params.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("tools.noParams")}
            </p>
          ) : (
            <ul className="ring-border divide-y rounded-xl ring-1 ring-inset">
              {params.map(([name, p]) => (
                <li key={name} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-[0.8rem] font-medium">
                      {name}
                    </code>
                    <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[0.7rem]">
                      {typeLabel(p)}
                    </span>
                    {required.has(name) && (
                      <span className="dark:text-primary text-[0.7rem] text-amber-700">
                        {t("tools.required")}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
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
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
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
              <p className="text-destructive py-10 text-center text-sm">
                {error}
              </p>
            ) : !tools ? (
              <div className="flex flex-col gap-4" aria-busy="true">
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2Icon className="size-4 animate-spin" />
                  {t("tools.loadingHint")}
                </p>
                <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: esqueleto fixo
                      key={i}
                      className="bg-muted/45 ring-border/70 flex h-[92px] flex-col gap-2 rounded-xl p-3 ring-1 ring-inset"
                    >
                      <span className="bg-muted-foreground/15 h-3.5 w-1/3 animate-pulse rounded" />
                      <span className="bg-muted-foreground/10 h-3 w-full animate-pulse rounded" />
                      <span className="bg-muted-foreground/10 h-3 w-4/5 animate-pulse rounded" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : shown.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
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
                        className="bg-muted/45 ring-border/70 hover:bg-muted hover:ring-border focus-visible:ring-ring flex h-full w-full flex-col gap-1 rounded-xl p-3 text-left ring-1 transition-colors outline-none ring-inset focus-visible:ring-2"
                      >
                        <span className="font-mono text-[0.8rem] font-medium break-all">
                          {tool.name}
                        </span>
                        {tool.description && (
                          <span className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
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
                    className="text-muted-foreground flex justify-center py-4"
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
  const { t, locale } = useI18n()
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
    native: t("kind.native"),
  }
  const kindDescription: Record<Kind, string> = {
    mcp: t("kind.mcpDescription"),
    api: t("kind.apiDescription"),
    stdio: t("kind.stdioDescription"),
    native: t("kind.nativeDescription"),
  }
  const statusLabel = {
    connected: t("status.connected"),
    pending: t("status.pending"),
    error: t("status.error"),
  }

  // Catalog of one-click connections; the dialog starts on it.
  const [catalog, setCatalog] = useState<Catalog>({ entries: [], native: {} })
  useEffect(() => {
    api<Catalog>("/catalog").then(setCatalog, () => {})
  }, [])
  const entryOf = (slug: string | null) =>
    catalog.entries.find((e) => e.slug === slug)
  // undefined = picking from the catalog; "custom" = the full form.
  const [pick, setPick] = useState<CatalogEntry | "custom">()
  const entry = pick && pick !== "custom" ? pick : undefined

  function openCreate() {
    setPick(undefined)
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
      const base = {
        projectId: targetProject,
        name: form.get("name"),
        slug: form.get("slug"),
      }
      const spec =
        entry?.connect.kind === "native"
          ? catalog.native[entry.connect.plugin]
          : undefined
      const fields = spec
        ? await nativeFieldsFrom(form, spec, targetProject, secrets, t)
        : {}
      const created = await api<Connection>("/connections", {
        body: entry
          ? { ...base, plugin: entry.slug, ...entryBody(entry, form, fields) }
          : {
              ...base,
              kind,
              ...((kind === "mcp" || kind === "api") && {
                url: form.get("url"),
              }),
              ...(kind === "mcp" && { headers: headersBody(form) }),
              ...(kind === "api" && apiBody(form)),
              ...(kind === "stdio" && stdio && stdioBody(form, stdio)),
            },
      })
      if (created.status === "error" && created.lastError)
        toast.error(created.lastError)
      setCreating(false)
      reload()
      // OAuth (remote MCP from the catalog, native plugins) asks for the account's consent
      // right away.
      if (created.status === "pending" && (entry || created.kind === "native"))
        await connect(created)
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
              : editing.kind === "native"
                ? {
                    fields: await nativeFieldsFrom(
                      form,
                      catalog.native[
                        editing.native?.native ?? ""
                      ] as NativeSpec,
                      editing.projectId,
                      secrets,
                      t
                    ),
                  }
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
              className="surface hover:border-foreground/15 flex min-w-0 flex-col gap-4 p-5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <BrandIcon icon={entryOf(conn.plugin)?.icon} name={conn.name} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h3 className="truncate font-medium">{conn.name}</h3>
                  <p className="text-muted-foreground truncate font-mono text-xs">
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
                  className="text-muted-foreground truncate font-mono text-xs"
                  title={conn.url}
                >
                  {conn.url}
                </p>
                {conn.native?.account && (
                  <p className="text-muted-foreground truncate text-xs">
                    {conn.native.account}
                  </p>
                )}
                {conn.status === "error" && conn.lastError && (
                  <p
                    className="text-destructive line-clamp-2 text-xs"
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
            <DialogTitle className="flex items-center gap-2">
              {pick && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="-ml-2"
                  aria-label={t("catalog.back")}
                  title={t("catalog.back")}
                  onClick={() => setPick(undefined)}
                >
                  <ArrowLeftIcon />
                </Button>
              )}
              {entry
                ? entry.name
                : view.project
                  ? t("connections.newIn", { project: view.project.name })
                  : t("connections.new")}
            </DialogTitle>
            <DialogDescription>
              {entry
                ? entry.tagline[locale]
                : pick
                  ? kindDescription[kind]
                  : t("catalog.description")}
            </DialogDescription>
          </DialogHeader>
          {!pick ? (
            <CatalogPicker
              entries={catalog.entries}
              connections={allConnections.filter(
                (c) => c.projectId === targetProject
              )}
              onPick={(e) => {
                setName(e.name)
                setPick(e)
              }}
              onCustom={() => setPick("custom")}
            />
          ) : (
            <form onSubmit={create} className="flex flex-col gap-5">
              <FieldGroup>
                {!entry && (
                  <Segmented
                    aria-label={t("connections.type")}
                    value={kind}
                    onChange={setKind}
                    options={kinds}
                  />
                )}
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
                    placeholder={entry?.name ?? "Cloudflare"}
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
                {entry && entry.connect.kind !== "native" && (
                  <EntryKeyField
                    entry={entry}
                    vault={vaultFor(targetProject)}
                  />
                )}
                {entry?.connect.kind === "native" &&
                  catalog.native[entry.connect.plugin] && (
                    <NativeFields
                      key={targetProject}
                      spec={catalog.native[entry.connect.plugin] as NativeSpec}
                      projectId={targetProject}
                      secrets={secrets}
                      guide={entry.connect.guide}
                      links={entry.connect.links}
                    />
                  )}
                {!entry && (kind === "mcp" || kind === "api") && (
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
                {!entry && kind === "mcp" && (
                  <HeaderFields
                    key={draft?.url}
                    initial={draft?.headers}
                    vault={vaultFor(targetProject)}
                  />
                )}
                {!entry && kind === "api" && (
                  <ApiFields vault={vaultFor(targetProject)} />
                )}
                {!entry && kind === "stdio" && (
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
                    (!entry && kind === "stdio" && !stdio)
                  }
                >
                  {busy === "create" ? t("common.working") : t("common.create")}
                </Button>
              </DialogFooter>
            </form>
          )}
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
                  : editing?.kind === "native"
                    ? t("native.editHint")
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
                ) : editing.kind === "native" ? (
                  catalog.native[editing.native?.native ?? ""] && (
                    <NativeFields
                      spec={
                        catalog.native[
                          editing.native?.native ?? ""
                        ] as NativeSpec
                      }
                      connection={editing}
                      projectId={editing.projectId}
                      secrets={secrets}
                      links={nativeLinks(entryOf(editing.plugin))}
                    />
                  )
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
