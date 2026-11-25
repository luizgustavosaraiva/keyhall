import {
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  FolderUpIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
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
  type Skill,
  type SkillDetail,
  type SkillFile,
  type SkillVersionDetail,
  type View,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import {
  type ImportedSkill,
  importFromDataTransfer,
  importFromFileList,
  parseSkillMd,
} from "@/lib/skill-import"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"

function nextMinor(version: string) {
  const [major = 1, minor = 0] = version.split(".").map(Number)
  return `${major}.${minor + 1}`
}

function nextMajor(version: string) {
  const [major = 1] = version.split(".").map(Number)
  return `${major + 1}.0`
}

type DraftFile = { id: string; path: string; content: string; open?: boolean }

// Drag-and-drop or file/folder picker for importing an existing Agent Skill
// (a directory with SKILL.md + supporting files, a standalone SKILL.md, or a .zip/.skill archive).
function SkillImportZone({
  onImport,
  summary,
}: {
  onImport: (imported: ImportedSkill) => void
  summary?: { source: string; fileCount: number; skippedBinary: number }
}) {
  const { t } = useI18n()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string>()
  const folderRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function run(load: () => Promise<ImportedSkill>) {
    setError(undefined)
    try {
      const imported = await load()
      onImport(imported)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <section
        aria-label={t("skills.importDrop")}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          run(() => importFromDataTransfer(e.dataTransfer))
        }}
        className={cn(
          "border-input bg-muted/30 flex flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors",
          over && "bg-muted/60 border-ring",
          error && "border-destructive"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="bg-background ring-border text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg ring-1">
              <FolderUpIcon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">
                {summary
                  ? summary.fileCount === 0
                    ? t("skills.importLoadedNone", { source: summary.source })
                    : t("skills.importLoaded", {
                        source: summary.source,
                        n: summary.fileCount,
                      })
                  : t("skills.importDrop")}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("skills.importHint")}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => folderRef.current?.click()}
            >
              <FolderUpIcon />
              {t("skills.importFolder")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <UploadIcon />
              {t("skills.importFile")}
            </Button>
          </div>
        </div>

        <input
          ref={folderRef}
          type="file"
          className="sr-only"
          multiple
          // Non-standard attribute supported by Chromium, Firefox and Safari for folder upload.
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(e) => {
            const list = e.target.files
            if (list?.length) run(() => importFromFileList(list))
            e.target.value = ""
          }}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".md,.markdown,.zip,.skill,text/markdown,application/zip"
          className="sr-only"
          onChange={(e) => {
            const list = e.target.files
            if (list?.length) run(() => importFromFileList(list))
            e.target.value = ""
          }}
        />
      </section>
      {summary && summary.skippedBinary > 0 && (
        <p className="text-muted-foreground text-xs">
          {t("skills.importSkippedBinary", { n: summary.skippedBinary })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}

function SupportingFilesEditor({
  files,
  onChange,
}: {
  files: DraftFile[]
  onChange: (next: DraftFile[]) => void
}) {
  const { t } = useI18n()
  const add = () =>
    onChange([
      ...files,
      { id: crypto.randomUUID(), path: "", content: "", open: true },
    ])
  const update = (id: string, patch: Partial<DraftFile>) =>
    onChange(files.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const remove = (id: string) => onChange(files.filter((f) => f.id !== id))

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>
          {t("skills.files")}
          {files.length > 0 && (
            <span className="text-muted-foreground ml-1.5 font-normal">
              ({files.length})
            </span>
          )}
        </FieldLabel>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <PlusIcon />
          {t("skills.addFile")}
        </Button>
      </div>
      <FieldDescription>{t("skills.filesHint")}</FieldDescription>
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((file) => {
            const isOpen = file.open ?? !file.path
            const bytes = new TextEncoder().encode(file.content).length
            return (
              <div
                key={file.id}
                className="bg-muted/40 ring-border flex flex-col gap-2 rounded-xl p-2.5 ring-1 ring-inset"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => update(file.id, { open: !isOpen })}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDownIcon
                      className={cn(
                        "text-muted-foreground size-3.5 shrink-0 transition-transform",
                        !isOpen && "-rotate-90"
                      )}
                    />
                    <FileTextIcon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                      {file.path || t("skills.filePath")}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                      {bytes} B
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("skills.removeFile")}
                    title={t("skills.removeFile")}
                    onClick={() => remove(file.id)}
                  >
                    <XIcon />
                  </Button>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-2 pt-1">
                    <Input
                      value={file.path}
                      onChange={(e) =>
                        update(file.id, { path: e.target.value })
                      }
                      placeholder={t("skills.filePath")}
                      className="font-mono text-xs"
                      required
                    />
                    <Textarea
                      value={file.content}
                      onChange={(e) =>
                        update(file.id, { content: e.target.value })
                      }
                      placeholder={t("skills.fileContent")}
                      rows={4}
                      spellCheck={false}
                      className="font-mono text-xs"
                      required
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Field>
  )
}

function HistoryDialog({
  skill,
  projectSlug,
  multiProject,
  onClose,
  onActivated,
  onEditFrom,
}: {
  skill?: Skill
  projectSlug?: string
  multiProject: boolean
  onClose: () => void
  onActivated: () => void
  onEditFrom: (skill: Skill, version: SkillVersionDetail) => void
}) {
  const { t, date } = useI18n()
  const [detail, setDetail] = useState<SkillDetail>()
  const [selectedVer, setSelectedVer] = useState<string>()
  const [versionDetail, setVersionDetail] = useState<SkillVersionDetail>()
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (!skill) return
    setDetail(undefined)
    setVersionDetail(undefined)
    let live = true
    api<SkillDetail>(`/skills/${skill.id}`)
      .then((d) => {
        if (!live) return
        setDetail(d)
        setSelectedVer(d.activeVersion)
        if (d.active) setVersionDetail(d.active)
      })
      .catch((err: Error) => toast.error(err.message))
    return () => {
      live = false
    }
  }, [skill])

  useEffect(() => {
    if (!skill || !selectedVer || !detail) return
    if (selectedVer === detail.active?.version) {
      setVersionDetail(detail.active)
      return
    }
    setVersionDetail(undefined)
    let live = true
    api<SkillVersionDetail>(
      `/skills/${skill.id}/versions/${encodeURIComponent(selectedVer)}`
    )
      .then((v) => live && setVersionDetail(v))
      .catch((err: Error) => toast.error(err.message))
    return () => {
      live = false
    }
  }, [skill, selectedVer, detail])

  async function activate(version: string) {
    if (!skill) return
    setActivating(true)
    try {
      await api(`/skills/${skill.id}/active`, {
        method: "PUT",
        body: { version },
      })
      toast.success(t("skills.activated", { slug: skill.slug, version }))
      const fresh = await api<SkillDetail>(`/skills/${skill.id}`)
      setDetail(fresh)
      setSelectedVer(version)
      onActivated()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setActivating(false)
    }
  }

  const pinnedUri =
    skill && selectedVer
      ? multiProject && projectSlug
        ? `skill://${projectSlug}/v${selectedVer}/${skill.slug}/SKILL.md`
        : `skill://v${selectedVer}/${skill.slug}/SKILL.md`
      : ""

  return (
    <Dialog open={!!skill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{skill?.slug}</DialogTitle>
          <DialogDescription>
            {t("skills.historyDescription")}
          </DialogDescription>
        </DialogHeader>
        {!detail ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto md:grid-cols-[240px_1fr] md:overflow-hidden">
            <section className="flex flex-col gap-2 md:min-h-0 md:overflow-y-auto md:pr-1">
              <ul className="flex flex-col gap-1.5">
                {detail.versions.map((v) => {
                  const isActive = v.version === detail.activeVersion
                  const isSelected = v.version === selectedVer
                  return (
                    <li key={v.version}>
                      <button
                        type="button"
                        onClick={() => setSelectedVer(v.version)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left text-xs transition-colors",
                          isSelected
                            ? "bg-card ring-border shadow-[var(--shadow-surface)] ring-1"
                            : "bg-muted/40 hover:bg-muted/70"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-medium">
                            v{v.version}
                          </span>
                          {isActive && (
                            <StatusPill tone="success" dot={false}>
                              {t("skills.active")}
                            </StatusPill>
                          )}
                        </div>
                        {v.changelog && (
                          <span className="text-foreground/85 line-clamp-2">
                            {v.changelog}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {date(v.createdAt)}
                        </span>
                        {v.createdBy && (
                          <span className="text-muted-foreground truncate">
                            {v.createdBy}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="flex min-w-0 flex-col gap-4 md:min-h-0 md:overflow-y-auto md:pr-1">
              {!versionDetail ? (
                <p className="text-muted-foreground text-sm">
                  {t("common.loading")}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-sm font-medium">
                        v{versionDetail.version}
                      </span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {versionDetail.digest.slice(0, 23)}… ·{" "}
                        {versionDetail.size} B
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {skill && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEditFrom(skill, versionDetail)}
                        >
                          <PencilIcon />
                          {t("skills.editFrom", {
                            version: versionDetail.version,
                          })}
                        </Button>
                      )}
                      {versionDetail.version !== detail.activeVersion && (
                        <Button
                          size="sm"
                          disabled={activating}
                          onClick={() => activate(versionDetail.version)}
                        >
                          <CheckCircle2Icon />
                          {t("skills.activate", {
                            version: versionDetail.version,
                          })}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs font-medium">
                      {t("skills.pinnedUri")}
                    </span>
                    <div className="bg-muted/50 ring-border flex items-center gap-2 rounded-xl px-3 py-1.5 ring-1 ring-inset">
                      <code className="min-w-0 flex-1 truncate font-mono text-xs">
                        {pinnedUri}
                      </code>
                      <CopyButton value={pinnedUri} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground text-xs font-medium">
                      {t("skills.rendered")}
                    </span>
                    <CodeBlock value={versionDetail.renderedSkillMd} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      {t("skills.files")}
                    </span>
                    {versionDetail.files.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("skills.noFiles")}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {versionDetail.files.map((f) => (
                          <div key={f.path} className="flex flex-col gap-1">
                            <span className="flex items-center gap-1.5 font-mono text-xs font-medium">
                              <FileTextIcon className="text-muted-foreground size-3.5" />
                              {f.path}
                            </span>
                            <CodeBlock value={f.content} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function Skills({
  view,
  skills,
  allSkills,
  reload,
}: {
  view: View
  skills: Skill[]
  allSkills: Skill[]
  reload: () => void
}) {
  const { t, date } = useI18n()
  const confirm = useConfirm()
  const projects = view.org.projects
  const projectOf = (id: string) => projects.find((p) => p.id === id)

  // Create new skill dialog state.
  const [creating, setCreating] = useState(false)
  const [projectId, setProjectId] = useState("")
  const targetProject = view.project?.id ?? projectId
  const [slugInput, setSlugInput] = useState("")
  const slug = slugify(slugInput)
  const slugTaken = allSkills.some(
    (s) => s.projectId === targetProject && s.slug === slug
  )
  const [createVersion, setCreateVersion] = useState("1.0")
  const [createDescription, setCreateDescription] = useState("")
  const [createBody, setCreateBody] = useState("")
  const [createExtra, setCreateExtra] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [createFiles, setCreateFiles] = useState<DraftFile[]>([])
  const [createImport, setCreateImport] = useState<{
    source: string
    fileCount: number
    skippedBinary: number
  }>()

  // Publish new version dialog state.
  const [publishing, setPublishing] = useState<{
    skill: Skill
    base: SkillVersionDetail
  }>()
  const [bumpMode, setBumpMode] = useState<"minor" | "major" | "custom">(
    "minor"
  )
  const [customVersion, setCustomVersion] = useState("")
  const [publishDescription, setPublishDescription] = useState("")
  const [publishBody, setPublishBody] = useState("")
  const [publishExtra, setPublishExtra] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [publishChangelog, setPublishChangelog] = useState("")
  const [activateOnPublish, setActivateOnPublish] = useState(true)
  const [publishFiles, setPublishFiles] = useState<DraftFile[]>([])
  const [publishImport, setPublishImport] = useState<{
    source: string
    fileCount: number
    skippedBinary: number
  }>()

  // Version history dialog state.
  const [historyOf, setHistoryOf] = useState<Skill>()
  const [busy, setBusy] = useState(false)

  function openCreate() {
    setProjectId(projects[0]?.id ?? "")
    setSlugInput("")
    setCreateVersion("1.0")
    setCreateDescription("")
    setCreateBody("")
    setCreateExtra(null)
    setCreateFiles([])
    setCreateImport(undefined)
    setCreating(true)
  }

  function applyCreateImport(imported: ImportedSkill) {
    if (imported.name) setSlugInput(imported.name)
    if (imported.version) setCreateVersion(imported.version)
    if (imported.description) setCreateDescription(imported.description)
    setCreateBody(imported.body)
    setCreateExtra(imported.frontmatterExtra)
    setCreateFiles(
      imported.files.map((f) => ({
        id: crypto.randomUUID(),
        path: f.path,
        content: f.content,
        open: false,
      }))
    )
    setCreateImport({
      source: imported.sourceName ?? "SKILL.md",
      fileCount: imported.files.length,
      skippedBinary: imported.skippedBinary.length,
    })
  }

  // If the admin pastes a complete SKILL.md (with YAML frontmatter) into the instructions box,
  // automatically extract name, description, version and extra frontmatter.
  function handleCreateBodyChange(next: string) {
    if (next.startsWith("---\n") && /\n---(?:\n|$)/.test(next)) {
      const parsed = parseSkillMd(next)
      if (parsed.name && !slugInput) setSlugInput(parsed.name)
      if (parsed.description && !createDescription)
        setCreateDescription(parsed.description)
      if (parsed.version) setCreateVersion(parsed.version)
      if (parsed.frontmatterExtra) setCreateExtra(parsed.frontmatterExtra)
      setCreateBody(parsed.body)
      return
    }
    setCreateBody(next)
  }

  async function openPublish(sk: Skill, fromVersion?: SkillVersionDetail) {
    try {
      let base = fromVersion
      if (!base) {
        const d = await api<SkillDetail>(`/skills/${sk.id}`)
        if (!d.active) return
        base = d.active
      }
      setBumpMode("minor")
      setCustomVersion(nextMinor(sk.latestVersion))
      setPublishDescription(base.description)
      setPublishBody(base.body)
      setPublishExtra(base.frontmatterExtra)
      setPublishChangelog("")
      setActivateOnPublish(true)
      setPublishFiles(
        base.files.map((f) => ({
          id: crypto.randomUUID(),
          path: f.path,
          content: f.content,
          open: false,
        }))
      )
      setPublishImport(undefined)
      setHistoryOf(undefined)
      setPublishing({ skill: sk, base })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function applyPublishImport(imported: ImportedSkill) {
    if (imported.description) setPublishDescription(imported.description)
    setPublishBody(imported.body)
    setPublishExtra(imported.frontmatterExtra)
    if (imported.files.length > 0) {
      setPublishFiles(
        imported.files.map((f) => ({
          id: crypto.randomUUID(),
          path: f.path,
          content: f.content,
          open: false,
        }))
      )
    }
    setPublishImport({
      source: imported.sourceName ?? "SKILL.md",
      fileCount: imported.files.length,
      skippedBinary: imported.skippedBinary.length,
    })
  }

  function handlePublishBodyChange(next: string) {
    if (next.startsWith("---\n") && /\n---(?:\n|$)/.test(next)) {
      const parsed = parseSkillMd(next)
      if (parsed.description) setPublishDescription(parsed.description)
      if (parsed.frontmatterExtra) setPublishExtra(parsed.frontmatterExtra)
      setPublishBody(parsed.body)
      return
    }
    setPublishBody(next)
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const version = createVersion.trim() || "1.0"
    setBusy(true)
    try {
      const files: SkillFile[] = createFiles
        .filter((f) => f.path.trim())
        .map((f) => ({ path: f.path.trim(), content: f.content }))
      await api("/skills", {
        body: {
          projectId: targetProject,
          slug,
          version,
          description: createDescription,
          body: createBody,
          frontmatterExtra: createExtra,
          files,
        },
      })
      toast.success(t("skills.created", { slug, version }))
      setCreating(false)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!publishing) return
    setBusy(true)
    try {
      const files: SkillFile[] = publishFiles
        .filter((f) => f.path.trim())
        .map((f) => ({ path: f.path.trim(), content: f.content }))
      const res = await api<{
        published?: { version: string }
        latestVersion: string
      }>(`/skills/${publishing.skill.id}/versions`, {
        body: {
          ...(bumpMode === "custom"
            ? { version: customVersion.trim() }
            : { bump: bumpMode }),
          description: publishDescription,
          body: publishBody,
          frontmatterExtra: publishExtra,
          changelog: publishChangelog.trim() || undefined,
          activate: activateOnPublish,
          files,
        },
      })
      toast.success(
        t("skills.published", {
          slug: publishing.skill.slug,
          version: res.published?.version ?? res.latestVersion,
        })
      )
      setPublishing(undefined)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(sk: Skill) {
    const ok = await confirm({
      title: t("skills.deleteTitle", { slug: sk.slug }),
      description: t("skills.deleteDescription", {
        slug: sk.slug,
        n: sk.versionCount,
      }),
      confirm: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/skills/${sk.id}`, { method: "DELETE" })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const canonicalUri = (sk: Skill) => {
    const p = projectOf(sk.projectId)
    return !view.project && p
      ? `skill://${p.slug}/${sk.slug}/SKILL.md`
      : `skill://${sk.slug}/SKILL.md`
  }

  return (
    <>
      <PageHeader
        title={t("skills.title")}
        description={
          view.project
            ? t("skills.descriptionProject", { project: view.project.name })
            : t("skills.descriptionOrg")
        }
        action={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t("skills.new")}
          </Button>
        }
      />

      {skills.length === 0 ? (
        <EmptyState
          icon={<SparklesIcon />}
          title={t("skills.emptyTitle")}
          description={t("skills.emptyDescription")}
          action={
            <Button variant="outline" onClick={openCreate}>
              <PlusIcon />
              {t("skills.new")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {skills.map((sk) => {
            const uri = canonicalUri(sk)
            return (
              <article
                key={sk.id}
                className="surface hover:border-foreground/15 flex min-w-0 flex-col gap-3 p-5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="bg-foreground/[0.06] text-foreground/70 flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <SparklesIcon className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-mono text-sm font-medium">
                        {sk.slug}
                      </h3>
                      <StatusPill tone="success" dot={false}>
                        v{sk.activeVersion}
                      </StatusPill>
                      {!view.project && (
                        <span className="text-muted-foreground text-xs">
                          {projectOf(sk.projectId)?.name}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {sk.description}
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
                      <DropdownMenuItem onClick={() => openPublish(sk)}>
                        <PencilIcon />
                        {t("skills.newVersion")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setHistoryOf(sk)}>
                        <HistoryIcon />
                        {t("skills.history")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => remove(sk)}
                      >
                        <Trash2Icon />
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="bg-muted/50 ring-border flex items-center gap-2 rounded-xl px-3 py-1.5 ring-1 ring-inset">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {uri}
                  </code>
                  <CopyButton value={uri} />
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {t("skills.versionsCount", { n: sk.versionCount })}
                    </span>
                    {sk.fileCount > 0 && (
                      <span>
                        · {t("skills.filesCount", { n: sk.fileCount })}
                      </span>
                    )}
                    <span>· {date(sk.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setHistoryOf(sk)}
                    >
                      <HistoryIcon />
                      {t("skills.history")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPublish(sk)}
                    >
                      <PencilIcon />
                      {t("skills.newVersion")}
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Create Skill */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("skills.new")}</DialogTitle>
            <DialogDescription>{t("skills.newDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-5">
            <SkillImportZone
              onImport={applyCreateImport}
              summary={createImport}
            />
            <FieldGroup>
              {!view.project && (
                <Field>
                  <FieldLabel htmlFor="sk-project">
                    {t("project.label")}
                  </FieldLabel>
                  <Choice
                    id="sk-project"
                    value={projectId}
                    onChange={setProjectId}
                    options={projects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field>
                  <FieldLabel htmlFor="sk-slug">{t("skills.slug")}</FieldLabel>
                  <Input
                    id="sk-slug"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value)}
                    placeholder="customer-refunds"
                    className="font-mono text-xs"
                    required
                  />
                  <FieldDescription>
                    {slugTaken
                      ? t("slug.taken")
                      : t("skills.slugHint", {
                          slug: slug || "customer-refunds",
                        })}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sk-ver">
                    {t("skills.initialVersion")}
                  </FieldLabel>
                  <Input
                    id="sk-ver"
                    value={createVersion}
                    onChange={(e) => setCreateVersion(e.target.value)}
                    pattern="\d+\.\d+(\.\d+)?"
                    className="font-mono text-xs"
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="sk-desc">
                  {t("skills.description")}
                </FieldLabel>
                <Input
                  id="sk-desc"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder={t("skills.descriptionPlaceholder")}
                  required
                />
                <FieldDescription>
                  {t("skills.descriptionHint")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="sk-body">{t("skills.body")}</FieldLabel>
                <Textarea
                  id="sk-body"
                  value={createBody}
                  onChange={(e) => handleCreateBodyChange(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder={t("skills.bodyPlaceholder")}
                  className="font-mono text-xs"
                  required
                />
                <FieldDescription>{t("skills.bodyHint")}</FieldDescription>
              </Field>
              <SupportingFilesEditor
                files={createFiles}
                onChange={setCreateFiles}
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !slug || slugTaken}>
                {busy ? t("common.working") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Publish New Version */}
      <Dialog
        open={!!publishing}
        onOpenChange={(o) => !o && setPublishing(undefined)}
      >
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">
              {publishing?.skill.slug}
            </DialogTitle>
            <DialogDescription>
              {publishing &&
                t("skills.newVersionDescription", {
                  slug: publishing.skill.slug,
                })}
            </DialogDescription>
          </DialogHeader>
          {publishing && (
            <form onSubmit={publish} className="flex flex-col gap-5">
              <SkillImportZone
                onImport={applyPublishImport}
                summary={publishImport}
              />
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("skills.bump")}</FieldLabel>
                  <Segmented
                    aria-label={t("skills.bump")}
                    value={bumpMode}
                    onChange={setBumpMode}
                    options={[
                      {
                        value: "minor",
                        label: t("skills.bumpMinor", {
                          version: nextMinor(publishing.skill.latestVersion),
                        }),
                      },
                      {
                        value: "major",
                        label: t("skills.bumpMajor", {
                          version: nextMajor(publishing.skill.latestVersion),
                        }),
                      },
                      {
                        value: "custom",
                        label: t("skills.bumpCustom"),
                      },
                    ]}
                  />
                </Field>
                {bumpMode === "custom" && (
                  <Field>
                    <FieldLabel htmlFor="sk-custom-ver">
                      {t("skills.customVersion")}
                    </FieldLabel>
                    <Input
                      id="sk-custom-ver"
                      value={customVersion}
                      onChange={(e) => setCustomVersion(e.target.value)}
                      pattern="\d+\.\d+(\.\d+)?"
                      placeholder="1.1.1"
                      className="font-mono text-xs"
                      required
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="sk-changelog">
                    {t("skills.changelog")}
                  </FieldLabel>
                  <Input
                    id="sk-changelog"
                    value={publishChangelog}
                    onChange={(e) => setPublishChangelog(e.target.value)}
                    placeholder={t("skills.changelogPlaceholder")}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sk-p-desc">
                    {t("skills.description")}
                  </FieldLabel>
                  <Input
                    id="sk-p-desc"
                    value={publishDescription}
                    onChange={(e) => setPublishDescription(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sk-p-body">
                    {t("skills.body")}
                  </FieldLabel>
                  <Textarea
                    id="sk-p-body"
                    value={publishBody}
                    onChange={(e) => handlePublishBodyChange(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    className="font-mono text-xs"
                    required
                  />
                </Field>
                <SupportingFilesEditor
                  files={publishFiles}
                  onChange={setPublishFiles}
                />
                <div className="bg-muted/50 ring-border flex items-center justify-between gap-4 rounded-xl px-4 py-3 ring-1 ring-inset">
                  <label
                    htmlFor="sk-activate"
                    className="flex cursor-pointer flex-col gap-0.5"
                  >
                    <span className="text-sm font-medium">
                      {t("skills.makeActive")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t("skills.makeActiveHint")}
                    </span>
                  </label>
                  <Switch
                    id="sk-activate"
                    checked={activateOnPublish}
                    onCheckedChange={setActivateOnPublish}
                  />
                </div>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPublishing(undefined)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? t("common.working") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <HistoryDialog
        skill={historyOf}
        projectSlug={
          historyOf ? projectOf(historyOf.projectId)?.slug : undefined
        }
        multiProject={!view.project}
        onClose={() => setHistoryOf(undefined)}
        onActivated={reload}
        onEditFrom={(sk, ver) => openPublish(sk, ver)}
      />
    </>
  )
}
