import { useEffect, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { authClient } from "@/lib/auth-client"
import { Dashboard } from "@/pages/dashboard"
import { Login } from "@/pages/login"
import { Setup } from "@/pages/setup"

export function App() {
  const { data: session, isPending } = authClient.useSession()
  // No users yet: show the first-run setup instead of the sign-in.
  const [setupNeeded, setSetupNeeded] = useState<boolean>()
  useEffect(() => {
    if (isPending || session) return
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d: { needed: boolean }) => setSetupNeeded(d.needed))
      .catch(() => setSetupNeeded(false))
  }, [isPending, session])

  return (
    <>
      {isPending ? null : session ? (
        <Dashboard
          user={{ name: session.user.name, email: session.user.email }}
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
