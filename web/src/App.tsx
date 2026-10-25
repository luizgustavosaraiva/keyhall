import { useEffect, useState } from "react"
import { toast } from "sonner"
import { redeemDeviceLink } from "@/components/devices"
import { Toaster } from "@/components/ui/sonner"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"
import { Dashboard } from "@/pages/dashboard"
import { Login } from "@/pages/login"
import { Setup } from "@/pages/setup"

export function App() {
  const { t } = useI18n()
  const { data: session, isPending, refetch } = authClient.useSession()
  // Opened from the QR code of another signed-in device: sign in with its code first.
  const [linking, setLinking] = useState(() =>
    window.location.hash.startsWith("#link=")
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: first load only
  useEffect(() => {
    if (!linking) return
    redeemDeviceLink()
      .then((ok) => {
        if (ok) refetch()
        else toast.error(t("devices.linkFailed"))
      })
      .catch(() => toast.error(t("devices.linkFailed")))
      .finally(() => setLinking(false))
  }, [])
  // No users yet: show the first-run setup instead of the sign-in.
  const [setupNeeded, setSetupNeeded] = useState<boolean>()
  useEffect(() => {
    if (isPending || session || linking) return
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d: { needed: boolean }) => setSetupNeeded(d.needed))
      .catch(() => setSetupNeeded(false))
  }, [isPending, session, linking])

  return (
    <>
      {isPending || linking ? null : session ? (
        <Dashboard
          user={{ name: session.user.name, email: session.user.email }}
          sessionToken={session.session.token}
        />
      ) : setupNeeded === undefined ? null : setupNeeded ? (
        <Setup />
      ) : (
        <Login />
      )}
      <Toaster position="top-center" />
    </>
  )
}

export default App
