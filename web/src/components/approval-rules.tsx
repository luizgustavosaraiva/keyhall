import { SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ToolTree } from "@/components/tool-tree"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { api, type Connection, type Tool } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

// Which tools of a connection wait for an admin's approval on each call, for every token.
export function ApprovalRulesDialog({
  connection,
  onClose,
  onSaved,
}: {
  connection?: Connection
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [tools, setTools] = useState<Tool[]>()
  const [error, setError] = useState<string>()
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!connection) return
    setTools(undefined)
    setError(undefined)
    setQuery("")
    setSelected(connection.approvalTools)
    api<Tool[]>(`/connections/${connection.id}/tools`)
      .then(setTools)
      .catch((err: Error) => setError(err.message))
  }, [connection])

  async function save() {
    if (!connection) return
    setSaving(true)
    try {
      await api(`/approvals/rules/${connection.id}`, {
        method: "PUT",
        body: { tools: selected },
      })
      toast.success(t("approvals.rulesSaved"))
      onSaved()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!connection} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("approvals.rulesTitle", { name: connection?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {t("approvals.rulesDescription")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : !tools ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : (
          <>
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("tools.search")}
                className="pl-9"
              />
            </div>
            <p className="text-muted-foreground -mt-2 text-xs">
              {selected.length === 0
                ? t("approvals.rulesNone")
                : t("approvals.rulesCount", { n: selected.length })}
            </p>
            <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
              <ToolTree
                tools={tools}
                selected={selected}
                onChange={setSelected}
                query={query}
              />
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !tools}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
