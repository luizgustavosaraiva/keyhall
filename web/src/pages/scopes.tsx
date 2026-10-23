import {
  LayersIcon,
  LockKeyholeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm"
import { Monogram } from "@/components/monogram"
import { NameDialog, type NameRequest } from "@/components/name-dialog"
import { EmptyState, PageHeader } from "@/components/page-header"
import { SlugField } from "@/components/slug-field"
import { ToolTree } from "@/components/tool-tree"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  api,
  type Connection,
  type Scope,
  type Secret,
  type Tool,
  type View,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"

type AllowedTools = Scope["allowedTools"]

// Right pane of the editor: a connection's tools within the scope.
function ToolPanel({
  connection,
  tools,
  error,
  value,
  onChange,
}: {
  connection: Connection
  tools?: Tool[]
  error?: string
  value: string[] | null
  onChange: (tools: string[] | null) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  // biome-ignore lint/correctness/useExhaustiveDependencies: clears the search when the connection changes
  useEffect(() => setQuery(""), [connection.id])

  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
      <div className="flex items-center gap-3">
        <Monogram name={connection.name} className="size-9 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{connection.name}</span>
          <span className="truncate font-mono text-muted-foreground text-xs">
            {connection.slug}__…
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3 ring-1 ring-border ring-inset">
        <label
          htmlFor="scope-all-tools"
          className="flex cursor-pointer flex-col gap-0.5"
        >
          <span className="font-medium text-sm">{t("scopes.allTools")}</span>
          <span className="text-muted-foreground text-xs">
            {t("scopes.allToolsHint")}
          </span>
        </label>
        <Switch
          id="scope-all-tools"
          checked={value === null}
          disabled={!tools}
          onCheckedChange={(checked) =>
            // When restricting, everything starts checked; the admin unchecks what isn't wanted.
            onChange(checked ? null : (tools?.map((tool) => tool.name) ?? []))
          }
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!tools && !error && (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      )}

      {tools && value !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("tools.search")}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(tools.map((tool) => tool.name))}
            >
              {t("scopes.selectAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange([])}
            >
              {t("scopes.clear")}
            </Button>
          </div>
          <p className="-mt-2 text-muted-foreground text-xs">
            {value.length === 0
              ? t("scopes.noneSelected")
              : t("scopes.selectedOf", {
                  n: value.length,
                  total: tools.length,
                })}
          </p>
          <div className="-mx-2 px-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <ToolTree
              tools={tools}
              selected={value}
              onChange={onChange}
              query={query}
            />
          </div>
        </>
      )}
    </div>
  )
}

export function Scopes({
  view,
  scopes,
  allScopes,
  connections,
  secrets,
  reload,
}: {
  view: View
  scopes: Scope[]
  allScopes: Scope[]
  // Every connection of the organization; a project scope only sees its project's.
  connections: Connection[]
  // The organization's secrets; a project scope only sees its project's.
  secrets: Secret[]
  reload: () => void
}) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const projectName = (id: string | null) =>
    view.org.projects.find((p) => p.id === id)?.name
  // undefined = closed; null = new scope; Scope = editing connections.
  const [editing, setEditing] = useState<Scope | null>()
  const [picked, setPicked] = useState<string[]>([])
  const [pickedSecrets, setPickedSecrets] = useState<string[]>([])
  const [allowed, setAllowed] = useState<AllowedTools>({})
  const [active, setActive] = useState<string>()
  const [tools, setTools] = useState<Record<string, Tool[]>>({})
  const [toolErrors, setToolErrors] = useState<Record<string, string>>({})
  const [naming, setNaming] = useState<NameRequest>()
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState("")
  const slug = slugify(name)
  const slugTaken = allScopes.some(
    (s) => s.orgId === view.org.id && s.slug === slug
  )
  // A new scope belongs to the viewed project; in the organization view, to the organization.
  const scopeProject =
    editing === undefined
      ? null
      : editing
        ? editing.projectId
        : (view.project?.id ?? null)
  const available = scopeProject
    ? connections.filter((c) => c.projectId === scopeProject)
    : connections
  const activeConn = available.find((c) => c.id === active)
  const availableSecrets = scopeProject
    ? secrets.filter((x) => x.projectId === scopeProject)
    : secrets

  // Loads the tools of the connection open in the pane (once per connection).
  useEffect(() => {
    if (!active || tools[active] || toolErrors[active]) return
    api<Tool[]>(`/connections/${active}/tools`)
      .then((list) => setTools((prev) => ({ ...prev, [active]: list })))
      .catch((err: Error) =>
        setToolErrors((prev) => ({ ...prev, [active]: err.message }))
      )
  }, [active, tools, toolErrors])

  function open(scope: Scope | null) {
    setName("")
    setPicked(scope?.connectionIds ?? [])
    setPickedSecrets(scope?.secretIds ?? [])
    setAllowed(scope?.allowedTools ?? {})
    const first = scope?.connectionIds[0]
    setActive(first)
    setEditing(scope)
  }

  function togglePicked(id: string, checked: boolean) {
    setPicked((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    )
    if (checked) setActive(id)
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    try {
      // Keeps restrictions only for connections still in the scope.
      const kept = Object.fromEntries(
        Object.entries(allowed).filter(([id]) => picked.includes(id))
      )
      if (editing) {
        await api(`/scopes/${editing.id}/connections`, {
          method: "PUT",
          body: {
            connectionIds: picked,
            secretIds: pickedSecrets,
            allowedTools: kept,
          },
        })
      } else {
        await api("/scopes", {
          body: {
            orgId: view.org.id,
            projectId: view.project?.id ?? null,
            name,
            slug,
            connectionIds: picked,
            secretIds: pickedSecrets,
            allowedTools: kept,
          },
        })
      }
      setEditing(undefined)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(scope: Scope) {
    const ok = await confirm({
      title: t("scopes.deleteTitle", { name: scope.name }),
      description: t("scopes.deleteDescription"),
      confirm: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api(`/scopes/${scope.id}`, { method: "DELETE" })
    reload()
  }

  function rename(scope: Scope) {
    setNaming({
      title: t("scopes.rename"),
      description: t("rename.description"),
      submit: t("common.save"),
      initial: scope.name,
      onSubmit: async (newName) => {
        await api(`/scopes/${scope.id}`, {
          method: "PATCH",
          body: { name: newName },
        })
        reload()
      },
    })
  }

  const connName = (id: string) =>
    connections.find((c) => c.id === id)?.name ?? id
  const toolSummary = (list: string[] | null | undefined) =>
    list == null
      ? t("scopes.chipAll")
      : t("scopes.chipCount", { n: list.length })

  return (
    <>
      <PageHeader
        title={t("scopes.title")}
        description={
          view.project
            ? t("scopes.descriptionProject", { project: view.project.name })
            : t("scopes.descriptionOrg")
        }
        action={
          <Button onClick={() => open(null)}>
            <PlusIcon />
            {t("scopes.new")}
          </Button>
        }
      />

      {scopes.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title={t("scopes.emptyTitle")}
          description={t("scopes.emptyDescription")}
          action={
            <Button variant="outline" onClick={() => open(null)}>
              <PlusIcon />
              {t("scopes.new")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scopes.map((s) => (
            <article
              key={s.id}
              className="surface flex min-w-0 flex-col gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-raised)]"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-foreground/70">
                  <LayersIcon className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h3 className="truncate font-semibold">{s.name}</h3>
                  <p className="truncate text-muted-foreground text-xs">
                    {s.projectId
                      ? t("scopes.levelProject", {
                          project: projectName(s.projectId) ?? "?",
                        })
                      : t("scopes.levelOrg")}
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
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => rename(s)}>
                      <PencilIcon />
                      {t("common.rename")}
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

              <div className="flex flex-wrap gap-1.5">
                {s.connectionIds.length === 0 && (
                  <span className="text-muted-foreground text-xs">
                    {t("scopes.noConnections")}
                  </span>
                )}
                {s.connectionIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex h-6 max-w-full items-center gap-1 truncate rounded-full bg-muted px-2.5 text-xs"
                  >
                    <span className="truncate font-medium">{connName(id)}</span>
                    <span className="text-muted-foreground">
                      · {toolSummary(s.allowedTools[id])}
                    </span>
                  </span>
                ))}
                {s.secretIds.length > 0 && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/12 px-2.5 text-amber-800 text-xs dark:text-primary">
                    <LockKeyholeIcon className="size-3" />
                    {t("scopes.secretCount", { n: s.secretIds.length })}
                  </span>
                )}
              </div>

              <div className="mt-auto flex justify-end border-t pt-4">
                <Button size="sm" variant="outline" onClick={() => open(s)}>
                  <SlidersHorizontalIcon />
                  {t("scopes.edit")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
      >
        <DialogContent className="flex max-h-[92svh] flex-col overflow-y-auto sm:max-w-5xl md:h-[min(90svh,880px)] md:overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editing ? editing.name : t("scopes.new")}
            </DialogTitle>
            <DialogDescription>
              {t("scopes.editorDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={save}
            className="flex flex-col gap-5 md:min-h-0 md:flex-1"
          >
            {!editing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="s-name">{t("common.name")}</FieldLabel>
                  <Input
                    id="s-name"
                    placeholder="Claude Code"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </Field>
                <SlugField
                  id="s-slug"
                  slug={slug}
                  taken={slugTaken}
                  hint={
                    view.project
                      ? t("scopes.slugHintProject", {
                          project: view.project.name,
                        })
                      : t("scopes.slugHintOrg", { org: view.org.name })
                  }
                />
              </div>
            )}

            <div className="flex flex-col gap-4 md:grid md:min-h-0 md:flex-1 md:grid-cols-[minmax(240px,300px)_1fr]">
              {/* Connections */}
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-2xl bg-muted/40 p-2 ring-1 ring-border ring-inset md:max-h-none md:min-h-0">
                <span className="px-2 pt-1 pb-1.5 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                  {t("scopes.connections")}
                </span>
                {available.length === 0 && (
                  <p className="px-2 text-muted-foreground text-sm">
                    {t("scopes.createConnectionFirst")}
                  </p>
                )}
                {available.map((c) => {
                  const included = picked.includes(c.id)
                  const list = allowed[c.id]
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors",
                        active === c.id
                          ? "bg-card shadow-[var(--shadow-surface)] ring-1 ring-border"
                          : "hover:bg-card/60"
                      )}
                    >
                      <Checkbox
                        checked={included}
                        onCheckedChange={(checked) =>
                          togglePicked(c.id, checked)
                        }
                        aria-label={c.name}
                      />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-col text-left outline-none"
                        onClick={() => setActive(c.id)}
                      >
                        <span className="truncate font-medium text-sm">
                          {scopeProject
                            ? c.name
                            : `${projectName(c.projectId) ?? "?"} / ${c.name}`}
                        </span>
                        <span className="truncate text-muted-foreground text-xs">
                          {included
                            ? toolSummary(list)
                            : t("scopes.notIncluded")}
                        </span>
                      </button>
                    </div>
                  )
                })}
                {availableSecrets.length > 0 && (
                  <>
                    <span className="mt-3 px-2 pt-1 pb-1.5 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                      {t("scopes.secrets")}
                    </span>
                    {availableSecrets.map((x) => (
                      <div
                        key={x.id}
                        className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-card/60"
                      >
                        <Checkbox
                          id={`sec-${x.id}`}
                          checked={pickedSecrets.includes(x.id)}
                          onCheckedChange={(checked) =>
                            setPickedSecrets((prev) =>
                              checked
                                ? [...prev, x.id]
                                : prev.filter((id) => id !== x.id)
                            )
                          }
                        />
                        <label
                          htmlFor={`sec-${x.id}`}
                          className="flex min-w-0 flex-1 cursor-pointer flex-col"
                        >
                          <span className="truncate font-medium font-mono text-xs">
                            {scopeProject
                              ? x.name
                              : `${projectName(x.projectId) ?? "?"} / ${x.name}`}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {x.agentAccess
                              ? t("scopes.secretAgents")
                              : t("scopes.secretRest")}
                          </span>
                        </label>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Tools */}
              <div className="flex min-h-64 flex-col rounded-2xl p-4 ring-1 ring-border ring-inset md:min-h-0">
                {!activeConn ? (
                  <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center text-muted-foreground text-sm">
                    <SlidersHorizontalIcon className="size-6" />
                    {t("scopes.pickConnection")}
                  </div>
                ) : !picked.includes(activeConn.id) ? (
                  <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
                    <Monogram name={activeConn.name} />
                    <p className="text-muted-foreground text-sm">
                      {t("scopes.notIncludedHint", { name: activeConn.name })}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => togglePicked(activeConn.id, true)}
                    >
                      <PlusIcon />
                      {t("scopes.include")}
                    </Button>
                  </div>
                ) : (
                  <ToolPanel
                    connection={activeConn}
                    tools={tools[activeConn.id]}
                    error={toolErrors[activeConn.id]}
                    value={allowed[activeConn.id] ?? null}
                    onChange={(list) =>
                      setAllowed((prev) => ({ ...prev, [activeConn.id]: list }))
                    }
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <span className="mr-auto hidden text-muted-foreground text-xs sm:block">
                {t("scopes.summary", { n: picked.length })}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(undefined)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saving || (!editing && (!slug || slugTaken))}
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <NameDialog request={naming} onClose={() => setNaming(undefined)} />
    </>
  )
}
