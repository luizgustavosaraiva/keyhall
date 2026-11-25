import {
  LayersIcon,
  LockKeyholeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { AccessPicker } from "@/components/access-picker"
import { useConfirm } from "@/components/confirm"
import { NameDialog, type NameRequest } from "@/components/name-dialog"
import { EmptyState, PageHeader } from "@/components/page-header"
import { SlugField } from "@/components/slug-field"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  api,
  type Connection,
  type Scope,
  type Secret,
  type Skill,
  type View,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { slugify } from "@/lib/slug"

type AllowedTools = Scope["allowedTools"]

export function Scopes({
  view,
  scopes,
  allScopes,
  connections,
  secrets,
  skills,
  reload,
}: {
  view: View
  scopes: Scope[]
  allScopes: Scope[]
  // Every connection of the organization; a project scope only sees its project's.
  connections: Connection[]
  // The organization's secrets and skills; a project scope only sees its project's.
  secrets: Secret[]
  skills: Skill[]
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
  const [pickedSkills, setPickedSkills] = useState<string[]>([])
  const [allowed, setAllowed] = useState<AllowedTools>({})
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
  const availableSecrets = scopeProject
    ? secrets.filter((x) => x.projectId === scopeProject)
    : secrets
  const availableSkills = scopeProject
    ? skills.filter((x) => x.projectId === scopeProject)
    : skills

  function open(scope: Scope | null) {
    setName("")
    setPicked(scope?.connectionIds ?? [])
    setPickedSecrets(scope?.secretIds ?? [])
    setPickedSkills(scope?.skillIds ?? [])
    setAllowed(scope?.allowedTools ?? {})
    setEditing(scope)
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
            skillIds: pickedSkills,
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
            skillIds: pickedSkills,
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
              className="surface hover:border-foreground/15 flex min-w-0 flex-col gap-4 p-5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="bg-foreground/[0.06] text-foreground/70 flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <LayersIcon className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h3 className="truncate font-medium">{s.name}</h3>
                  <p className="text-muted-foreground truncate text-xs">
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
                    className="bg-muted inline-flex h-6 max-w-full items-center gap-1 truncate rounded-full px-2.5 text-xs"
                  >
                    <span className="truncate font-medium">{connName(id)}</span>
                    <span className="text-muted-foreground">
                      · {toolSummary(s.allowedTools[id])}
                    </span>
                  </span>
                ))}
                {s.secretIds.length > 0 && (
                  <span className="bg-muted text-muted-foreground inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs">
                    <LockKeyholeIcon className="size-3" />
                    {t("scopes.secretCount", { n: s.secretIds.length })}
                  </span>
                )}
                {s.skillIds.length > 0 && (
                  <span className="bg-muted text-muted-foreground inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs">
                    <SparklesIcon className="size-3" />
                    {t("scopes.skillCount", { n: s.skillIds.length })}
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

            <AccessPicker
              key={editing?.id ?? "new"}
              connections={available}
              secrets={availableSecrets}
              skills={availableSkills}
              projectName={scopeProject ? undefined : (id) => projectName(id)}
              value={{
                connectionIds: picked,
                allowedTools: allowed,
                secretIds: pickedSecrets,
                skillIds: pickedSkills,
              }}
              onChange={(v) => {
                setPicked(v.connectionIds)
                setAllowed(v.allowedTools)
                setPickedSecrets(v.secretIds)
                setPickedSkills(v.skillIds)
              }}
            />

            <DialogFooter>
              <span className="text-muted-foreground mr-auto hidden text-xs sm:block">
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
