import {
  BracesIcon,
  KeyRoundIcon,
  ListIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Choice } from "@/components/choice"
import { useConfirm } from "@/components/confirm"
import { CodeBlock, CopyButton } from "@/components/copy-button"
import { EmptyState, PageHeader } from "@/components/page-header"
import { Segmented } from "@/components/segmented"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, type Scope, type Token, type View } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type Level = Token["target"]["kind"]
type Mode = Token["mode"]
type Expiry = "never" | "30" | "90" | "365"
type Snippet = "claude" | "json" | "curl" | "secrets"

function snippet(kind: Snippet, endpoint: string, key: string) {
  if (kind === "secrets") {
    const base = endpoint.replace(/\/mcp$/, "/api/secrets")
    return `# list the secrets this token reaches\ncurl ${base} -H "Authorization: Bearer ${key}"\n\n# read one\ncurl ${base}/NAME -H "Authorization: Bearer ${key}"`
  }
  if (kind === "claude")
    return `claude mcp add --transport http --scope user keyhall ${endpoint} \\\n  --header "Authorization: Bearer ${key}"`
  if (kind === "json")
    return JSON.stringify(
      {
        mcpServers: {
          keyhall: {
            type: "http",
            url: endpoint,
            headers: { Authorization: `Bearer ${key}` },
          },
        },
      },
      null,
      2
    )
  return `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "content-type: application/json" \\\n  -H "accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
}

export function Tokens({
  view,
  tokens,
  scopes,
  reload,
}: {
  view: View
  // Already filtered for the current view.
  tokens: Token[]
  scopes: Scope[]
  reload: () => void
}) {
  const { t, date } = useI18n()
  const confirm = useConfirm()
  const { org } = view
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ key: string }>()
  const [level, setLevel] = useState<Level>("scope")
  const [expiry, setExpiry] = useState<Expiry>("never")
  const [mode, setMode] = useState<Mode>("code")
  const [shown, setShown] = useState<Snippet>("claude")
  const [pending, setPending] = useState(false)
  const orgScopes = scopes.filter((s) => s.orgId === org.id)
  const viewScopes = view.project
    ? orgScopes.filter((s) => s.projectId === view.project?.id)
    : orgScopes

  // Describes the token's target: organization, project or scope (with its project).
  function describe(target: Token["target"]) {
    if (target.kind === "org")
      return target.id === org.id
        ? t("tokens.targetOrg", { name: org.name })
        : t("tokens.targetOtherOrg")
    if (target.kind === "project") {
      const p = org.projects.find((x) => x.id === target.id)
      return p ? t("tokens.targetProject", { name: p.name }) : "?"
    }
    const s = scopes.find((x) => x.id === target.id)
    if (!s) return t("tokens.targetRemoved")
    return t("tokens.targetScope", { name: s.name })
  }

  function openCreate() {
    setLevel(viewScopes.length ? "scope" : view.project ? "project" : "org")
    setExpiry("never")
    setMode("code")
    setShown("claude")
    setCreated(undefined)
    setCreating(true)
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const id =
      level === "org"
        ? org.id
        : String(form.get(level === "project" ? "project" : "scope"))
    setPending(true)
    try {
      const { key } = await api<{ key: string }>("/tokens", {
        body: {
          name: form.get("name"),
          target: { kind: level, id },
          expiresInDays: expiry === "never" ? undefined : Number(expiry),
          mode,
        },
      })
      setCreated({ key })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function revoke(token: Token) {
    const ok = await confirm({
      title: t("tokens.revokeTitle", { name: token.name ?? "" }),
      description: t("tokens.revokeDescription"),
      confirm: t("tokens.revoke"),
      destructive: true,
    })
    if (!ok) return
    await api(`/tokens/${token.id}`, { method: "DELETE" })
    reload()
  }

  async function switchMode(token: Token) {
    try {
      await api(`/tokens/${token.id}`, {
        method: "PATCH",
        body: { mode: token.mode === "code" ? "tools" : "code" },
      })
      toast.success(t("tokens.modeChanged"))
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const endpoint = `${window.location.origin}/mcp`
  const expired = (tk: Token) =>
    !!tk.expiresAt && new Date(tk.expiresAt) < new Date()

  return (
    <>
      <PageHeader
        title={t("tokens.title")}
        description={t("tokens.description")}
        action={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t("tokens.new")}
          </Button>
        }
      />

      <div className="surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium text-sm">{t("tokens.endpoint")}</span>
          <span className="text-muted-foreground text-xs">
            {t("tokens.endpointHint")}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1 rounded-xl bg-muted/60 py-1 pr-1 pl-3 ring-1 ring-border ring-inset">
          <code className="truncate font-mono text-xs">{endpoint}</code>
          <CopyButton value={endpoint} />
        </div>
      </div>

      {tokens.length === 0 ? (
        <EmptyState
          icon={<KeyRoundIcon />}
          title={t("tokens.emptyTitle")}
          description={t("tokens.emptyDescription")}
          action={
            <Button variant="outline" onClick={openCreate}>
              <PlusIcon />
              {t("tokens.new")}
            </Button>
          }
        />
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {tokens.map((tk) => (
            <li
              key={tk.id}
              className="flex flex-wrap items-center gap-3 px-5 py-4 sm:flex-nowrap"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-amber-700 dark:text-primary">
                  <KeyRoundIcon className="size-5" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{tk.name}</span>
                  <span className="truncate font-mono text-muted-foreground text-xs">
                    {tk.start}…
                  </span>
                </div>
              </div>
              {/* On a phone the details drop to their own line, under the name. */}
              <div className="order-last flex basis-full flex-wrap items-center gap-x-6 gap-y-2 text-xs max-sm:pl-13 sm:order-none sm:basis-auto sm:justify-end">
                <StatusPill
                  tone={tk.target.kind === "scope" ? "neutral" : "warning"}
                  dot={false}
                >
                  {describe(tk.target)}
                </StatusPill>
                {tk.mode === "code" && (
                  <StatusPill tone="success" dot={false}>
                    <BracesIcon className="size-3" />
                    {t("tokens.modeCode")}
                  </StatusPill>
                )}
                <span className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">
                    {t("tokens.lastUsed")}
                  </span>
                  <span>{date(tk.lastRequest)}</span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">
                    {t("tokens.expires")}
                  </span>
                  <span className={expired(tk) ? "text-destructive" : ""}>
                    {tk.expiresAt ? date(tk.expiresAt) : t("tokens.never")}
                  </span>
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label={t("common.more")}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onClick={() => switchMode(tk)}>
                    {tk.mode === "code" ? <ListIcon /> : <BracesIcon />}
                    {tk.mode === "code"
                      ? t("tokens.toTools")
                      : t("tokens.toCode")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => revoke(tk)}
                  >
                    <Trash2Icon />
                    {t("tokens.revoke")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={creating}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setCreated(undefined)
          }
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {created ? t("tokens.created") : t("tokens.new")}
            </DialogTitle>
            <DialogDescription>
              {created ? t("tokens.copyNow") : t("tokens.newDescription")}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 ring-1 ring-primary/30 ring-inset">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">
                  {created.key}
                </code>
                <CopyButton value={created.key} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-medium text-sm">{t("tokens.useIt")}</span>
                <Segmented
                  value={shown}
                  onChange={setShown}
                  options={[
                    { value: "claude", label: "Claude Code" },
                    { value: "json", label: "mcpServers JSON" },
                    { value: "curl", label: "curl" },
                    { value: "secrets", label: "Secrets" },
                  ]}
                />
                <CodeBlock value={snippet(shown, endpoint, created.key)} />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setCreating(false)
                    setCreated(undefined)
                  }}
                >
                  {t("common.done")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={create} className="flex flex-col gap-5">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="t-name">{t("common.name")}</FieldLabel>
                  <Input
                    id="t-name"
                    name="name"
                    placeholder="Claude Code (laptop)"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("tokens.access")}</FieldLabel>
                  <Segmented
                    aria-label={t("tokens.access")}
                    value={level}
                    onChange={setLevel}
                    options={[
                      { value: "scope", label: t("tokens.levelScope") },
                      { value: "project", label: t("tokens.levelProject") },
                      { value: "org", label: t("tokens.levelOrg") },
                    ]}
                  />
                  <FieldDescription>
                    {
                      {
                        scope: t("tokens.levelScopeHint"),
                        project: t("tokens.levelProjectHint"),
                        org: t("tokens.levelOrgHint", { name: org.name }),
                      }[level]
                    }
                  </FieldDescription>
                </Field>
                {level !== "scope" && (
                  <p className="flex gap-2 rounded-xl bg-warning/12 px-3 py-2 text-amber-800 text-xs dark:text-warning">
                    <ShieldAlertIcon className="size-4 shrink-0" />
                    {t("tokens.broadWarning")}
                  </p>
                )}
                {level === "project" && (
                  <Field>
                    <FieldLabel htmlFor="t-project">
                      {t("project.label")}
                    </FieldLabel>
                    <Choice
                      id="t-project"
                      name="project"
                      defaultValue={view.project?.id ?? org.projects[0]?.id}
                      options={org.projects.map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                    />
                  </Field>
                )}
                {level === "scope" && (
                  <Field>
                    <FieldLabel htmlFor="t-scope">
                      {t("tokens.scope")}
                    </FieldLabel>
                    <Choice
                      id="t-scope"
                      name="scope"
                      required
                      defaultValue={viewScopes[0]?.id}
                      options={viewScopes.map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                    />
                    {viewScopes.length === 0 && (
                      <FieldDescription>
                        {t("tokens.createScopeFirst")}
                      </FieldDescription>
                    )}
                  </Field>
                )}
                <Field>
                  <FieldLabel>{t("tokens.mode")}</FieldLabel>
                  <Segmented
                    aria-label={t("tokens.mode")}
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "code", label: t("tokens.modeCode") },
                      { value: "tools", label: t("tokens.modeTools") },
                    ]}
                  />
                  <FieldDescription>
                    {mode === "code"
                      ? t("tokens.modeCodeHint")
                      : t("tokens.modeToolsHint")}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{t("tokens.expiry")}</FieldLabel>
                  <Segmented
                    aria-label={t("tokens.expiry")}
                    value={expiry}
                    onChange={setExpiry}
                    options={[
                      { value: "never", label: t("tokens.never") },
                      { value: "30", label: t("tokens.days", { n: 30 }) },
                      { value: "90", label: t("tokens.days", { n: 90 }) },
                      { value: "365", label: t("tokens.year") },
                    ]}
                  />
                </Field>
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
                    pending || (level === "scope" && viewScopes.length === 0)
                  }
                >
                  {t("tokens.create")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
