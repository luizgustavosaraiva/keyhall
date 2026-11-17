import { useEffect, useState } from "react"
import { toast } from "sonner"
import { redeemDeviceLink } from "@/components/devices"
import { Toaster } from "@/components/ui/sonner"
import { authClient } from "@/lib/auth-client"
import { useI18n } from "@/lib/i18n"
import { Authorize } from "@/pages/authorize"
import { Dashboard } from "@/pages/dashboard"
import { Invite, pendingInvite } from "@/pages/invite"
import { Login } from "@/pages/login"
import { MemberHome } from "@/pages/member"
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
  // Opened from an invitation link (#invite=...): the invitation page, signed in or not.
  const [invite, setInvite] = useState(pendingInvite)
  const [setupNeeded, setSetupNeeded] = useState<boolean>()
  const [google, setGoogle] = useState(false)
  useEffect(() => {
    if (isPending || session || linking) return
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d: { needed: boolean; google?: boolean }) => {
        setGoogle(!!d.google)
        setSetupNeeded(d.needed)
      })
      .catch(() => setSetupNeeded(false))
  }, [isPending, session, linking])

  return (
    <>
      {isPending || linking ? null : invite ? (
        <Invite
          code={invite}
          session={session ? { email: session.user.email } : null}
          onDone={() => {
            setInvite(null)
            refetch()
          }}
        />
      ) : session ? (
        // An MCP client asking for access by OAuth: the consent page instead of the panel.
        window.location.pathname === "/oauth/authorize" ? (
          <Authorize member={session.user.role !== "admin"} />
        ) : session.user.role === "admin" ? (
          <Dashboard
            user={{ name: session.user.name, email: session.user.email }}
            sessionToken={session.session.token}
          />
        ) : (
          // Invited people see only what was granted to them.
          <MemberHome
            user={{ name: session.user.name, email: session.user.email }}
            sessionToken={session.session.token}
          />
        )
      ) : setupNeeded === undefined ? null : setupNeeded ? (
        <Setup />
      ) : (
        <Login google={google} />
      )}
      <Toaster position="top-center" />
    </>
  )
}

export default App
