import {
  BotIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  LockKeyholeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  api,
  type Connection,
  type Secret,
  type SecretHistory,
  type View,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const without = (map: Record<string, string>, key: string) =>
  Object.fromEntries(Object.entries(map).filter(([k]) => k !== key))

// Name in environment-variable format: the same works for {{secret:NAME}} and env.
const toName = (text: string) => text.toUpperCase().replace(/[^A-Z0-9_]/g, "_")

// Masked value field with a show button. Values may span lines (PEM, JSON).
function ValueField({
  id,
  label,
  required,
}: {
  id: string
  label: string
  required?: boolean
}) {
  const { t } = useI18n()
  const [shown, setShown] = useState(false)
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        >
          {shown ? (
            <EyeOffIcon className="size-3.5" />
          ) : (
            <EyeIcon className="size-3.5" />
          )}
          {shown ? t("vault.hide") : t("vault.show")}
        </button>
      </div>
      <Textarea
        id={id}
        name="value"
        rows={3}
        spellCheck={false}
        autoComplete="off"
        required={required}
        className={cn(
          "min-h-20 font-mono text-xs",
          !shown && "[-webkit-text-security:disc]"
        )}
      />
    </Field>
  )
}

function AgentSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3 ring-1 ring-border ring-inset">
        <label
          htmlFor="v-agents"
          className="flex cursor-pointer flex-col gap-0.5"
        >
          <span className="font-medium text-sm">{t("vault.agents")}</span>
          <span className="text-muted-foreground text-xs">
            {t("vault.agentsHint")}
          </span>
        </label>
        <Switch id="v-agents" checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && (
        <p className="rounded-xl bg-warning/12 px-3 py-2 text-amber-800 text-xs dark:text-warning">
          {t("vault.agentsWarning")}
        </p>
      )}
    </div>
  )
}

function HistoryDialog({
  secret,
  onClose,
}: {
  secret?: Secret
  onClose: () => void
}) {
  const { t, date } = useI18n()
  const [history, setHistory] = useState<SecretHistory>()
  useEffect(() => {
    if (!secret) return
    setHistory(undefined)
    let live = true
    api<SecretHistory>(`/secrets/${secret.id}/history`)
      .then((h) => live && setHistory(h))
      .catch((err: Error) => toast.error(err.message))
    return () => {
      live = false
    }
  }, [secret])
  const via = { rest: "REST", mcp: "MCP", panel: t("vault.viaPanel") }
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{secret?.name}</DialogTitle>
          <DialogDescription>{t("vault.historyDescription")}</DialogDescription>
        </DialogHeader>
        {!history ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <section className="flex flex-col gap-2">
              <h3 className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                {t("vault.versions")}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {history.versions.map((v) => (
                  <li
                    key={v.version}
                    className="flex flex-col rounded-xl bg-muted/50 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">
                      v{v.version}
                      {v.version === secret?.version && (
                        <span className="ml-1.5 text-success">
                          · {t("vault.current")}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {date(v.createdAt)}
                    </span>
                    {v.createdBy && (
                      <span className="truncate text-muted-foreground">
                        {v.createdBy}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                {t("vault.reads")}
              </h3>
              {history.reads.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("vault.noReads")}
                </p>
              ) : (
                <ul className="divide-y rounded-xl ring-1 ring-border ring-inset">
                  {history.reads.map((r) => (
                    <li
                      key={`${r.createdAt}-${r.actor}-${r.via}`}
                      className="flex items-center gap-3 px-3 py-2 text-xs"
                    >
                      <StatusPill
                        tone={r.via === "mcp" ? "warning" : "neutral"}
                        dot={false}
                      >
                        {via[r.via]}
                      </StatusPill>
                      <span className="min-w-0 flex-1 truncate">{r.actor}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        v{r.version} · {date(r.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

type Usage = "one" | "env" | "mcp"

export function Secrets({
  view,
  secrets,
  allSecrets,
  connections,
  reload,
}: {
  view: View
  // Already filtered for the current view.
  secrets: Secret[]
  allSecrets: Secret[]
  connections: Connection[]
  reload: () => void
}) {
  const { t, date } = useI18n()
  const confirm = useConfirm()
  const projects = view.org.projects
  const projectOf = (id: string) => projects.find((p) => p.id === id)
  const [creating, setCreating] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [name, setName] = useState("")
  const [agents, setAgents] = useState(false)
  const [rotating, setRotating] = useState<Secret>()
  const [editing, setEditing] = useState<Secret>()
  const [history, setHistory] = useState<Secret>()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [usage, setUsage] = useState<Usage>("one")
  const [pending, setPending] = useState(false)

  const targetProject = view.project?.id ?? projectId
  const taken = allSecrets.some(
    (s) => s.projectId === targetProject && s.name === name
  )
  const origin = window.location.origin
  const example = secrets[0]?.name ?? "STRIPE_KEY"
  const usageCode: Record<Usage, string> = {
    one: `curl ${origin}/api/secrets/${example} \\\n  -H "Authorization: Bearer <token>"`,
    env: `# all secrets the token reaches, as NAME='value'\nset -a; source <(curl -s "${origin}/api/secrets?format=env" \\\n  -H "Authorization: Bearer <token>"); set +a`,
    mcp: t("vault.usageMcp"),
  }

  function openCreate() {
    setName("")
    setAgents(false)
    setProjectId(projects[0]?.id ?? "")
    setCreating(true)
  }

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    try {
      await action()
      reload()
      return true
    } catch (err) {
      toast.error((err as Error).message)
      return false
    } finally {
      setPending(false)
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const ok = await run(() =>
      api("/secrets", {
        body: {
          projectId: targetProject,
          name,
          value: form.get("value"),
          description: String(form.get("description") ?? "") || undefined,
          agentAccess: agents,
        },
      })
    )
    if (ok) setCreating(false)
  }

  async function rotate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!rotating) return
    const value = new FormData(e.currentTarget).get("value")
    const ok = await run(() =>
      api(`/secrets/${rotating.id}`, { method: "PATCH", body: { value } })
    )
    if (ok) {
      toast.success(t("vault.rotated", { name: rotating.name }))
      setRevealed((prev) => without(prev, rotating.id))
      setRotating(undefined)
    }
  }

  async function saveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    const description = String(
      new FormData(e.currentTarget).get("description") ?? ""
    )
    const ok = await run(() =>
      api(`/secrets/${editing.id}`, {
        method: "PATCH",
        body: { description: description || null, agentAccess: agents },
      })
    )
    if (ok) setEditing(undefined)
  }

  async function reveal(s: Secret) {
    if (revealed[s.id] !== undefined) {
      setRevealed((prev) => without(prev, s.id))
      return
    }
    try {
      const { value } = await api<{ value: string }>(
        `/secrets/${s.id}/reveal`,
        { method: "POST" }
      )
      setRevealed((prev) => ({ ...prev, [s.id]: value }))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function remove(s: Secret) {
    const ok = await confirm({
      title: t("vault.deleteTitle", { name: s.name }),
      description: t("vault.deleteDescription"),
      confirm: t("common.delete"),
      destructive: true,
    })
    if (ok) await run(() => api(`/secrets/${s.id}`, { method: "DELETE" }))
  }

  const connName = (id: string) =>
    connections.find((c) => c.id === id)?.name ?? "?"

  return (
    <>
      <PageHeader
        title={t("vault.title")}
        description={t("vault.description")}
        action={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t("vault.new")}
          </Button>
        }
      />

      {secrets.length === 0 ? (
        <EmptyState
          icon={<LockKeyholeIcon />}
          title={t("vault.emptyTitle")}
          description={t("vault.emptyDescription")}
          action={
            <Button variant="outline" onClick={openCreate}>
              <PlusIcon />
              {t("vault.new")}
            </Button>
          }
        />
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {secrets.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-foreground/70">
                    <LockKeyholeIcon className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-mono font-semibold text-sm">
                      {s.name}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {[
                        view.project ? null : projectOf(s.projectId)?.name,
                        s.description,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("vault.noDescription")}
                    </span>
                  </div>
                </div>
                {/* On a phone the details drop to their own line, under the name. */}
                <div className="order-last flex basis-full flex-wrap items-center gap-2 text-xs max-sm:pl-13 sm:order-none sm:basis-auto sm:justify-end">
                  {s.agentAccess && (
                    <StatusPill tone="warning" dot={false}>
                      <BotIcon className="size-3" />
                      {t("vault.agentsPill")}
                    </StatusPill>
                  )}
                  {s.usedBy.length > 0 && (
                    <StatusPill
                      tone="neutral"
                      dot={false}
                      title={s.usedBy.map(connName).join(", ")}
                    >
                      {t("vault.usedBy", { n: s.usedBy.length })}
                    </StatusPill>
                  )}
                  <span className="px-1 text-muted-foreground tabular-nums">
                    v{s.version} · {date(s.updatedAt)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => reveal(s)}>
                    {revealed[s.id] !== undefined ? (
                      <EyeOffIcon />
                    ) : (
                      <EyeIcon />
                    )}
                    {revealed[s.id] !== undefined
                      ? t("vault.hide")
                      : t("vault.reveal")}
                  </Button>
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
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setRotating(s)}>
                      <RotateCwIcon />
                      {t("vault.rotate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setAgents(s.agentAccess)
                        setEditing(s)
                      }}
                    >
                      <PencilIcon />
                      {t("vault.editDetails")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistory(s)}>
                      <HistoryIcon />
                      {t("vault.history")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => remove(s)}
                    >
                      <Trash2Icon />
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {revealed[s.id] !== undefined && (
                <div className="flex items-start gap-2 rounded-xl bg-muted/60 py-1 pr-1 pl-3 ring-1 ring-border ring-inset sm:ml-13">
                  <code className="min-w-0 flex-1 whitespace-pre-wrap break-all py-1.5 font-mono text-xs">
                    {revealed[s.id]}
                  </code>
                  <CopyButton value={revealed[s.id]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-base">{t("vault.usageTitle")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("vault.usageDescription")}
          </p>
        </div>
        <Segmented
          value={usage}
          onChange={setUsage}
          options={[
            { value: "one", label: t("vault.usageOne") },
            { value: "env", label: t("vault.usageEnv") },
            { value: "mcp", label: "MCP" },
          ]}
          className="sm:max-w-md"
        />
        {usage === "mcp" ? (
          <p className="rounded-xl bg-muted/70 px-4 py-3 text-sm leading-relaxed ring-1 ring-border ring-inset">
            {usageCode.mcp}
          </p>
        ) : (
          <CodeBlock value={usageCode[usage]} />
        )}
        <p className="text-muted-foreground text-xs">{t("vault.usageRefs")}</p>
      </section>

      {/* New secret */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("vault.new")}</DialogTitle>
            <DialogDescription>{t("vault.newDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-5">
            <FieldGroup>
              {!view.project && (
                <Field>
                  <FieldLabel htmlFor="v-project">
                    {t("project.label")}
                  </FieldLabel>
                  <Choice
                    id="v-project"
                    value={projectId}
                    onChange={setProjectId}
                    options={projects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                </Field>
              )}
              <Field data-invalid={taken || undefined}>
                <FieldLabel htmlFor="v-name">{t("common.name")}</FieldLabel>
                <Input
                  id="v-name"
                  value={name}
                  onChange={(e) => setName(toName(e.target.value))}
                  placeholder="STRIPE_SECRET_KEY"
                  className="font-mono"
                  autoComplete="off"
                  required
                />
                <FieldDescription>
                  {taken
                    ? t("vault.nameTaken")
                    : t("vault.nameHint", {
                        name: name || "STRIPE_SECRET_KEY",
                      })}
                </FieldDescription>
              </Field>
              <ValueField id="v-value" label={t("vault.value")} required />
              <Field>
                <FieldLabel htmlFor="v-description">
                  {t("vault.descriptionLabel")}
                </FieldLabel>
                <Input
                  id="v-description"
                  name="description"
                  placeholder={t("vault.descriptionPlaceholder")}
                />
              </Field>
              <AgentSwitch checked={agents} onChange={setAgents} />
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending || !name || taken}>
                {t("vault.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New value (new version) */}
      <Dialog
        open={!!rotating}
        onOpenChange={(o) => !o && setRotating(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">{rotating?.name}</DialogTitle>
            <DialogDescription>
              {t("vault.rotateDescription", {
                version: (rotating?.version ?? 0) + 1,
              })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={rotate} className="flex flex-col gap-5">
            <ValueField id="v-new-value" label={t("vault.newValue")} required />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRotating(undefined)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("vault.rotate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">{editing?.name}</DialogTitle>
            <DialogDescription>
              {t("vault.detailsDescription")}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveDetails} className="flex flex-col gap-5">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="v-edit-description">
                    {t("vault.descriptionLabel")}
                  </FieldLabel>
                  <Input
                    id="v-edit-description"
                    name="description"
                    defaultValue={editing.description ?? ""}
                    placeholder={t("vault.descriptionPlaceholder")}
                  />
                </Field>
                <AgentSwitch checked={agents} onChange={setAgents} />
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(undefined)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <HistoryDialog secret={history} onClose={() => setHistory(undefined)} />
    </>
  )
}
