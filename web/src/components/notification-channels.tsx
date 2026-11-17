import {
  BellIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Choice } from "@/components/choice"
import { useConfirm } from "@/components/confirm"
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
import { api } from "@/lib/api"
import { type MessageKey, useI18n } from "@/lib/i18n"

type FieldSpec = { name: string; secret?: boolean; optional?: boolean }
type Kind = "telegram" | "ntfy" | "discord" | "slack" | "webhook"

type Channel = {
  id: string
  name: string
  kind: Kind
  fields: Record<string, string>
  secretsSet: string[]
  includeArgs: boolean
  enabled: boolean
  lastSentAt: string | null
  lastError: string | null
}

const KIND_ORDER: Kind[] = ["telegram", "ntfy", "discord", "slack", "webhook"]

const PLACEHOLDERS: Record<string, string> = {
  botToken: "123456:ABC-DEF…",
  chatId: "123456789",
  url: "https://ntfy.sh/my-keyhall-topic",
  token: "tk_…",
  webhookUrl: "https://…",
  secret: "",
}

// Where keyhall tells admins that a call waits for approval.
export function NotificationChannels({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, date } = useI18n()
  const confirm = useConfirm()
  const [channels, setChannels] = useState<Channel[]>()
  const [kinds, setKinds] = useState<Record<Kind, FieldSpec[]>>()
  // undefined = list; null = new channel; Channel = editing.
  const [editing, setEditing] = useState<Channel | null>()
  const [kind, setKind] = useState<Kind>("telegram")
  const [includeArgs, setIncludeArgs] = useState(false)
  const [pending, setPending] = useState(false)

  const reload = useCallback(() => {
    api<{ channels: Channel[]; kinds: Record<Kind, FieldSpec[]> }>(
      "/notifications"
    )
      .then((d) => {
        setChannels(d.channels)
        setKinds(d.kinds)
      })
      .catch((err: Error) => toast.error(err.message))
  }, [])
  useEffect(() => {
    if (open) reload()
    else setEditing(undefined)
  }, [open, reload])

  function startEdit(ch: Channel | null) {
    setKind(ch?.kind ?? "telegram")
    setIncludeArgs(ch?.includeArgs ?? false)
    setEditing(ch)
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!kinds || editing === undefined) return
    const form = new FormData(e.currentTarget)
    const fields = Object.fromEntries(
      kinds[kind].map((f) => [f.name, String(form.get(f.name) ?? "")])
    )
    setPending(true)
    try {
      const body = { name: form.get("name"), fields, includeArgs }
      if (editing)
        await api(`/notifications/${editing.id}`, { method: "PATCH", body })
      else await api("/notifications", { body: { ...body, kind } })
      setEditing(undefined)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function test(ch: Channel) {
    try {
      await api(`/notifications/${ch.id}/test`, { method: "POST" })
      toast.success(t("notify.testSent", { name: ch.name }))
    } catch (err) {
      toast.error(t("notify.testFailed", { error: (err as Error).message }))
    } finally {
      reload()
    }
  }

  async function toggle(ch: Channel, enabled: boolean) {
    await api(`/notifications/${ch.id}`, {
      method: "PATCH",
      body: { enabled },
    }).catch((err: Error) => toast.error(err.message))
    reload()
  }

  async function remove(ch: Channel) {
    const ok = await confirm({
      title: t("notify.deleteTitle", { name: ch.name }),
      description: t("notify.deleteDescription"),
      confirm: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api(`/notifications/${ch.id}`, { method: "DELETE" })
    reload()
  }

  const kindLabel = (k: Kind) => t(`notify.kind.${k}` as MessageKey)
  const fieldLabel = (f: string) => t(`notify.field.${f}` as MessageKey)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {editing === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("notify.title")}</DialogTitle>
              <DialogDescription>{t("notify.description")}</DialogDescription>
            </DialogHeader>
            {channels?.length === 0 && (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
                <BellIcon className="size-6" />
                {t("notify.empty")}
              </div>
            )}
            {!!channels?.length && (
              <ul className="ring-border divide-y overflow-hidden rounded-xl ring-1">
                {channels.map((ch) => (
                  <li key={ch.id} className="flex items-center gap-3 px-4 py-3">
                    <Switch
                      checked={ch.enabled}
                      onCheckedChange={(v) => toggle(ch, v)}
                      aria-label={t("notify.enabled")}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {ch.name}
                      </span>
                      <span
                        className={
                          ch.lastError
                            ? "text-destructive truncate text-xs"
                            : "text-muted-foreground truncate text-xs"
                        }
                        title={ch.lastError ?? undefined}
                      >
                        {kindLabel(ch.kind)} ·{" "}
                        {ch.lastError
                          ? t("notify.lastError", { error: ch.lastError })
                          : ch.lastSentAt
                            ? t("notify.lastSent", {
                                at: date(ch.lastSentAt),
                              })
                            : t("notify.neverSent")}
                      </span>
                    </div>
                    {ch.includeArgs && (
                      <StatusPill tone="neutral" dot={false}>
                        {t("notify.withArgs")}
                      </StatusPill>
                    )}
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
                        <DropdownMenuItem onClick={() => test(ch)}>
                          <SendIcon />
                          {t("notify.test")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startEdit(ch)}>
                          <PencilIcon />
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => remove(ch)}
                        >
                          <Trash2Icon />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.done")}
              </Button>
              <Button onClick={() => startEdit(null)} disabled={!kinds}>
                <PlusIcon />
                {t("notify.add")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {editing ? editing.name : t("notify.add")}
              </DialogTitle>
              <DialogDescription>
                {t(`notify.help.${kind}` as MessageKey)}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="flex flex-col gap-5">
              <FieldGroup>
                {!editing && (
                  <Field>
                    <FieldLabel htmlFor="n-kind">{t("notify.kind")}</FieldLabel>
                    <Choice
                      id="n-kind"
                      value={kind}
                      onChange={(v) => setKind(v as Kind)}
                      options={KIND_ORDER.map((k) => ({
                        value: k,
                        label: kindLabel(k),
                      }))}
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="n-name">{t("common.name")}</FieldLabel>
                  <Input
                    id="n-name"
                    name="name"
                    required
                    defaultValue={editing?.name ?? ""}
                    placeholder={t("notify.namePlaceholder")}
                  />
                </Field>
                {kinds?.[kind].map((f) => {
                  const kept = editing?.secretsSet.includes(f.name)
                  return (
                    <Field key={`${kind}-${f.name}`}>
                      <FieldLabel htmlFor={`n-${f.name}`}>
                        {fieldLabel(f.name)}
                        {f.optional && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            ({t("common.optional")})
                          </span>
                        )}
                      </FieldLabel>
                      <Input
                        id={`n-${f.name}`}
                        name={f.name}
                        type={f.secret ? "password" : "text"}
                        autoComplete="off"
                        required={!f.optional && !kept}
                        defaultValue={editing?.fields[f.name] ?? ""}
                        placeholder={
                          kept ? t("notify.keep") : PLACEHOLDERS[f.name]
                        }
                      />
                    </Field>
                  )
                })}
                <Field orientation="horizontal">
                  <Switch
                    id="n-args"
                    checked={includeArgs}
                    onCheckedChange={setIncludeArgs}
                  />
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor="n-args">
                      {t("notify.includeArgs")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("notify.includeArgsHint")}
                    </FieldDescription>
                  </div>
                </Field>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
