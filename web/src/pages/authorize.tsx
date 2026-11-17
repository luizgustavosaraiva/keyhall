import { ShieldAlertIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { AuthLayout } from "@/components/auth-layout"
import { Choice } from "@/components/choice"
import { door } from "@/components/doorway"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { api, type Org, type Scope, type Token } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type Level = Token["target"]["kind"]
type Mode = Token["mode"]

// The authorization request as the MCP client sent it (client_id, redirect_uri, PKCE, state).
const request = () =>
  Object.fromEntries(new URLSearchParams(window.location.search))

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/mcp-oauth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `error ${res.status}`)
  return data as T
}

// Consent for an MCP client that asked keyhall for access by OAuth: the admin picks what it
// reaches, like a token, and the client gets one.
export function Authorize() {
  const { t } = useI18n()
  const [client, setClient] = useState<{
    client: string
    redirectHost: string
  }>()
  const [error, setError] = useState<string>()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [scopes, setScopes] = useState<Scope[]>([])
  const [orgId, setOrgId] = useState<string>()
  const [level, setLevel] = useState<Level>("scope")
  const [mode, setMode] = useState<Mode>("code")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    post<{ client: string; redirectHost: string }>("/check", request())
      .then(setClient)
      .catch((err: Error) => setError(err.message))
    Promise.all([api<Org[]>("/orgs"), api<Scope[]>("/scopes")])
      .then(([o, s]) => {
        setOrgs(o)
        setScopes(s)
        setOrgId(o[0]?.id)
        if (!s.length) setLevel("project")
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const org = orgs.find((o) => o.id === orgId)
  const orgScopes = useMemo(
    () => scopes.filter((s) => s.orgId === orgId),
    [scopes, orgId]
  )

  async function decide(approve: boolean, form?: FormData) {
    setPending(true)
    setError(undefined)
    try {
      const target = {
        kind: level,
        id:
          level === "org"
            ? orgId
            : String(form?.get(level === "project" ? "project" : "scope")),
      }
      if (approve) door.open()
      const { redirect } = await post<{ redirect: string }>(
        approve ? "/approve" : "/deny",
        approve ? { request: request(), target, mode } : { request: request() }
      )
      window.location.href = redirect
    } catch (err) {
      door.fail()
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title={
        client
          ? t("authorize.title", { client: client.client })
          : t("authorize.loading")
      }
      description={
        client ? t("authorize.description", { host: client.redirectHost }) : ""
      }
    >
      {!client ? (
        error && <FieldError>{error}</FieldError>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            decide(true, new FormData(e.currentTarget))
          }}
        >
          <FieldGroup>
            {orgs.length > 1 && (
              <Field>
                <FieldLabel htmlFor="o-org">{t("authorize.org")}</FieldLabel>
                <Choice
                  id="o-org"
                  value={orgId}
                  onChange={setOrgId}
                  options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Field>
            )}
            <Field>
              <FieldLabel>{t("tokens.access")}</FieldLabel>
              <Segmented
                aria-label={t("tokens.access")}
                value={level}
                onChange={setLevel}
                options={[
                  { value: "scope", label: t("tokens.levelScope") },
                  { value: "project", label: t("tokens.levelProject") },
                  { value: "org", label: t("tokens.levelOrg") },
                ]}
              />
              <FieldDescription>
                {
                  {
                    scope: t("tokens.levelScopeHint"),
                    project: t("tokens.levelProjectHint"),
                    org: t("tokens.levelOrgHint", { name: org?.name ?? "" }),
                  }[level]
                }
              </FieldDescription>
            </Field>
            {level !== "scope" && (
              <p className="bg-warning/12 dark:text-warning flex gap-2 rounded-xl px-3 py-2 text-xs text-amber-800">
                <ShieldAlertIcon className="size-4 shrink-0" />
                {t("tokens.broadWarning")}
              </p>
            )}
            {level === "project" && org && (
              <Field>
                <FieldLabel htmlFor="o-project">
                  {t("project.label")}
                </FieldLabel>
                <Choice
                  key={org.id}
                  id="o-project"
                  name="project"
                  defaultValue={org.projects[0]?.id}
                  options={org.projects.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </Field>
            )}
            {level === "scope" && (
              <Field>
                <FieldLabel htmlFor="o-scope">{t("tokens.scope")}</FieldLabel>
                <Choice
                  key={orgId}
                  id="o-scope"
                  name="scope"
                  required
                  defaultValue={orgScopes[0]?.id}
                  options={orgScopes.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
                {orgScopes.length === 0 && (
                  <FieldDescription>
                    {t("tokens.createScopeFirst")}
                  </FieldDescription>
                )}
              </Field>
            )}
            <Field>
              <FieldLabel>{t("tokens.mode")}</FieldLabel>
              <Segmented
                aria-label={t("tokens.mode")}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "code", label: t("tokens.modeCode") },
                  { value: "tools", label: t("tokens.modeTools") },
                ]}
              />
              <FieldDescription>
                {mode === "code"
                  ? t("tokens.modeCodeHint")
                  : t("tokens.modeToolsHint")}
              </FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending}
                onClick={() => decide(false)}
              >
                {t("authorize.deny")}
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={
                  pending || (level === "scope" && orgScopes.length === 0)
                }
              >
                {t("authorize.approve")}
              </Button>
            </div>
            <FieldDescription>{t("authorize.revokeHint")}</FieldDescription>
          </FieldGroup>
        </form>
      )}
    </AuthLayout>
  )
}
