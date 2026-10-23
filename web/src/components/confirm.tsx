import { createContext, type ReactNode, useContext, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/lib/i18n"

type Request = {
  title: string
  description?: string
  confirm: string
  destructive?: boolean
}

type Pending = Request & { resolve: (ok: boolean) => void }

const ConfirmContext = createContext<
  ((request: Request) => Promise<boolean>) | undefined
>(undefined)

// Replaces window.confirm: const ok = await confirm({ title, confirm }).
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [pending, setPending] = useState<Pending>()

  const ask = (request: Request) =>
    new Promise<boolean>((resolve) => setPending({ ...request, resolve }))

  function close(ok: boolean) {
    pending?.resolve(ok)
    setPending(undefined)
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog open={!!pending} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            {pending?.description && (
              <DialogDescription className="whitespace-pre-line">
                {pending.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={() => close(true)}
              autoFocus
            >
              {pending?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx
}
