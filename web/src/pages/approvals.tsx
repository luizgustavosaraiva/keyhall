import { CheckIcon, ShieldCheckIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CodeBlock } from "@/components/copy-button"
import { EmptyState, PageHeader } from "@/components/page-header"
import { StatusPill } from "@/components/status-pill"
import { Button } from "@/components/ui/button"
import { type Approval, api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

const MAX_ARGS = 4000

const argsText = (args: unknown) => {
  const text = JSON.stringify(args ?? {}, null, 2)
  return text.length > MAX_ARGS ? `${text.slice(0, MAX_ARGS)}\n…` : text
}

// Calls waiting for a decision, and the latest decisions. The agent's call waits a little; after
// that, an approval holds for the same call for 15 minutes.
export function Approvals({
  approvals,
  reload,
}: {
  // The organization's, newest first.
  approvals: Approval[]
  reload: () => void
}) {
  const { t, date } = useI18n()
  const [busy, setBusy] = useState<string>()
  const pending = approvals.filter((a) => a.status === "pending")
  const history = approvals.filter((a) => a.status !== "pending").slice(0, 30)

  async function decide(a: Approval, approve: boolean) {
    setBusy(a.id)
    try {
      await api(`/approvals/${a.id}/${approve ? "approve" : "deny"}`, {
        method: "POST",
      })
      toast.success(approve ? t("approvals.approved") : t("approvals.denied"))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(undefined)
      reload()
    }
  }

  const tone = {
    approved: "success",
    used: "success",
    denied: "danger",
    expired: "neutral",
    pending: "warning",
  } as const

  return (
    <>
      <PageHeader
        title={t("approvals.title")}
        description={t("approvals.description")}
      />
      {pending.length === 0 ? (
        <EmptyState
          icon={<ShieldCheckIcon />}
          title={t("approvals.emptyTitle")}
          description={t("approvals.emptyDescription")}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((a) => (
            <li
              key={a.id}
              className="surface ring-warning/40 flex flex-col gap-4 p-5 ring-1"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-mono text-sm font-medium break-all">
                    {a.exposedName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("approvals.who", {
                      token: a.tokenName,
                      person: a.requestedBy,
                      connection: a.connection.name,
                      project: a.project.name,
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("approvals.when", {
                      at: date(a.createdAt),
                      until: date(a.expiresAt),
                    })}
                  </span>
                </div>
                <div className="flex gap-2 max-sm:w-full max-sm:*:flex-1">
                  <Button
                    variant="outline"
                    disabled={busy === a.id}
                    onClick={() => decide(a, false)}
                  >
                    <XIcon />
                    {t("approvals.deny")}
                  </Button>
                  <Button
                    disabled={busy === a.id}
                    onClick={() => decide(a, true)}
                  >
                    <CheckIcon />
                    {t("approvals.approve")}
                  </Button>
                </div>
              </div>
              <CodeBlock value={argsText(a.args)} />
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            {t("approvals.history")}
          </h2>
          <ul className="surface divide-y overflow-hidden">
            {history.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {a.exposedName}
                </span>
                <span className="text-muted-foreground text-xs">
                  {a.tokenName} · {date(a.decidedAt ?? a.createdAt)}
                  {a.decidedBy ? ` · ${a.decidedBy}` : ""}
                </span>
                <StatusPill tone={tone[a.status]}>
                  {t(`approvals.status.${a.status}`)}
                </StatusPill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
