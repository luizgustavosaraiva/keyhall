import {
  LinkIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { AccessPicker, type AccessValue } from "@/components/access-picker"
import { useConfirm } from "@/components/confirm"
import { CopyButton } from "@/components/copy-button"
import { EmptyState, PageHeader } from "@/components/page-header"
import { StatusPill } from "@/components/status-pill"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  api,
  type Connection,
  type Member,
  type Scope,
  type Secret,
  type Skill,
  type View,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"

// Grants as the editor holds them: the picker's value plus the scopes.
type Grants = AccessValue & { scopeIds: string[] }

const grantsOf = (m: Member): Grants => ({
  connectionIds: Object.keys(m.connections),
  allowedTools: m.connections,
  secretIds: m.secretIds,
  skillIds: m.skillIds ?? [],
  scopeIds: m.scopeIds,
})

// People invited to the organization. Each one uses only what is granted here, through the
// panel and their own tokens; grants apply on the next call.
export function Team({
  view,
  members,
  connections,
  scopes,
  secrets,
  skills,
  reload,
}: {
  view: View
  // Members of the viewed organization.
  members: Member[]
  // The organization's connections, scopes, secrets and skills.
  connections: Connection[]
  scopes: Scope[]
  secrets: Secret[]
  skills: Skill[]
  reload: () => void
}) {
  const { t, date } = useI18n()
  const confirm = useConfirm()
  const { org } = view
  const [inviting, setInviting] = useState(false)
  const [link, setLink] = useState<{ member?: Member; url: string }>()
  const [editing, setEditing] = useState<Member>()
  const [grants, setGrants] = useState<Grants>()
  const [pending, setPending] = useState(false)
  const projectName = (id: string) =>
    org.projects.find((p) => p.id === id)?.name

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get("email"))
    setPending(true)
    try {
      const { link: url } = await api<{ id: string; link: string }>(
        "/members",
        { body: { orgId: org.id, email } }
      )
      setInviting(false)
      setLink({ url })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function newLink(m: Member) {
    try {
      const { link: url } = await api<{ link: string }>(
        `/members/${m.id}/link`,
        { method: "POST" }
      )
      setLink({ member: m, url })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function edit(m: Member) {
    setGrants(grantsOf(m))
    setEditing(m)
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing || !grants) return
    setPending(true)
    try {
      await api(`/members/${editing.id}/grants`, {
        method: "PUT",
        body: {
          connections: Object.fromEntries(
            grants.connectionIds.map((id) => [
              id,
              grants.allowedTools[id] ?? null,
            ])
          ),
          scopeIds: grants.scopeIds,
          secretIds: grants.secretIds,
          skillIds: grants.skillIds,
        },
      })
      setEditing(undefined)
      toast.success(t("team.saved"))
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function remove(m: Member) {
    const ok = await confirm({
      title: t("team.removeTitle", { name: m.name ?? m.email }),
      description: t("team.removeDescription"),
      confirm: t("team.remove"),
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/members/${m.id}`, { method: "DELETE" })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const summary = (m: Member) =>
    [
      t("team.countConnections", { n: Object.keys(m.connections).length }),
      t("team.countScopes", { n: m.scopeIds.length }),
      t("team.countSecrets", { n: m.secretIds.length }),
    ].join(" · ")

  const statusPill = (m: Member) =>
    m.status === "active" ? (
      <StatusPill tone="success">{t("team.active")}</StatusPill>
    ) : m.status === "invited" ? (
      <StatusPill
        tone="warning"
        title={t("team.invitedUntil", { date: date(m.inviteExpires) })}
      >
        {t("team.invited")}
      </StatusPill>
    ) : (
      <StatusPill tone="danger">{t("team.expired")}</StatusPill>
    )

  return (
    <>
      <PageHeader
        title={t("team.title")}
        description={t("team.description", { org: org.name })}
        action={
          <Button onClick={() => setInviting(true)}>
            <UserPlusIcon />
            {t("team.invite")}
          </Button>
        }
      />

      {members.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={t("team.emptyTitle")}
          description={t("team.emptyDescription")}
          action={
            <Button variant="outline" onClick={() => setInviting(true)}>
              <UserPlusIcon />
              {t("team.invite")}
            </Button>
          }
        />
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 px-5 py-4 sm:flex-nowrap"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                  {(m.name || m.email)[0]?.toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">
                    {m.name ?? m.email}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {m.name ? `${m.email} · ` : ""}
                    {summary(m)}
                  </span>
                </div>
              </div>
              <div className="order-last flex basis-full items-center gap-2 max-sm:pl-13 sm:order-none sm:basis-auto">
                {statusPill(m)}
                <Button size="sm" variant="outline" onClick={() => edit(m)}>
                  <SlidersHorizontalIcon />
                  {t("team.access")}
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
                <DropdownMenuContent align="end" className="w-52">
                  {m.status !== "active" && (
                    <>
                      <DropdownMenuItem onClick={() => newLink(m)}>
                        <LinkIcon />
                        {t("team.newLink")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => remove(m)}
                  >
                    <Trash2Icon />
                    {t("team.remove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {/* Invite: an e-mail, then the link to send. */}
      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("team.inviteTitle", { org: org.name })}
            </DialogTitle>
            <DialogDescription>{t("team.inviteDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={invite} className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="m-email">{t("team.email")}</FieldLabel>
              <Input
                id="m-email"
                name="email"
                type="email"
                placeholder="ana@example.com"
                required
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviting(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("team.createLink")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={link !== undefined}
        onOpenChange={(o) => !o && setLink(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("team.linkTitle")}</DialogTitle>
            <DialogDescription>{t("team.linkDescription")}</DialogDescription>
          </DialogHeader>
          <div className="bg-primary/10 ring-primary/30 flex items-center gap-2 rounded-xl p-3 ring-1 ring-inset">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">
              {link?.url}
            </code>
            {link && <CopyButton value={link.url} />}
          </div>
          <DialogFooter>
            <Button onClick={() => setLink(undefined)}>
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access: connections and tools, secrets and scopes of this organization. */}
      <Dialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
      >
        <DialogContent className="flex max-h-[92svh] flex-col overflow-y-auto sm:max-w-5xl md:h-[min(90svh,880px)] md:overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {t("team.accessTitle", {
                name: editing?.name ?? editing?.email ?? "",
              })}
            </DialogTitle>
            <DialogDescription>{t("team.accessDescription")}</DialogDescription>
          </DialogHeader>
          {editing && grants && (
            <form
              onSubmit={save}
              className="flex flex-col gap-5 md:min-h-0 md:flex-1"
            >
              <AccessPicker
                key={editing.id}
                connections={connections}
                secrets={secrets}
                skills={skills}
                projectName={projectName}
                value={grants}
                onChange={(v) => setGrants({ ...grants, ...v })}
                extra={
                  scopes.length > 0 && (
                    <>
                      <span className="text-muted-foreground mt-3 px-2 pt-1 pb-1.5 text-xs font-medium">
                        {t("team.scopes")}
                      </span>
                      {scopes.map((s) => (
                        <div
                          key={s.id}
                          className="hover:bg-card/60 flex items-center gap-2.5 rounded-xl px-2 py-2"
                        >
                          <Checkbox
                            id={`ms-${s.id}`}
                            checked={grants.scopeIds.includes(s.id)}
                            onCheckedChange={(checked) =>
                              setGrants({
                                ...grants,
                                scopeIds: checked
                                  ? [...grants.scopeIds, s.id]
                                  : grants.scopeIds.filter((x) => x !== s.id),
                              })
                            }
                          />
                          <label
                            htmlFor={`ms-${s.id}`}
                            className="flex min-w-0 flex-1 cursor-pointer flex-col"
                          >
                            <span className="truncate text-sm font-medium">
                              {s.name}
                            </span>
                            <span className="text-muted-foreground truncate text-xs">
                              {t("team.scopeHint", {
                                n: s.connectionIds.length,
                              })}
                            </span>
                          </label>
                        </div>
                      ))}
                    </>
                  )
                }
              />
              <FieldDescription>{t("team.accessHint")}</FieldDescription>
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
    </>
  )
}
