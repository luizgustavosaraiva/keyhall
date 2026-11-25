import { PlusIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Monogram } from "@/components/monogram"
import { ToolTree } from "@/components/tool-tree"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  api,
  type Connection,
  type Secret,
  type Skill,
  type Tool,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Connections, their tools, secrets and skills picked for a scope or granted to a member.
export type AccessValue = {
  connectionIds: string[]
  // Per connection: allowed tools; missing or null = all.
  allowedTools: Record<string, string[] | null>
  secretIds: string[]
  skillIds: string[]
}

// Right pane of the editor: a connection's tools within the scope.
function ToolPanel({
  connection,
  tools,
  error,
  value,
  onChange,
}: {
  connection: Connection
  tools?: Tool[]
  error?: string
  value: string[] | null
  onChange: (tools: string[] | null) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  // biome-ignore lint/correctness/useExhaustiveDependencies: clears the search when the connection changes
  useEffect(() => setQuery(""), [connection.id])

  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
      <div className="flex items-center gap-3">
        <Monogram name={connection.name} className="size-9 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{connection.name}</span>
          <span className="text-muted-foreground truncate font-mono text-xs">
            {connection.slug}__…
          </span>
        </div>
      </div>

      <div className="bg-muted/50 ring-border flex items-center justify-between gap-4 rounded-xl px-4 py-3 ring-1 ring-inset">
        <label
          htmlFor="scope-all-tools"
          className="flex cursor-pointer flex-col gap-0.5"
        >
          <span className="text-sm font-medium">{t("scopes.allTools")}</span>
          <span className="text-muted-foreground text-xs">
            {t("scopes.allToolsHint")}
          </span>
        </label>
        <Switch
          id="scope-all-tools"
          checked={value === null}
          disabled={!tools}
          onCheckedChange={(checked) =>
            // When restricting, everything starts checked; the admin unchecks what isn't wanted.
            onChange(checked ? null : (tools?.map((tool) => tool.name) ?? []))
          }
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!tools && !error && (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      )}

      {tools && value !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("tools.search")}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(tools.map((tool) => tool.name))}
            >
              {t("scopes.selectAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange([])}
            >
              {t("scopes.clear")}
            </Button>
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">
            {value.length === 0
              ? t("scopes.noneSelected")
              : t("scopes.selectedOf", {
                  n: value.length,
                  total: tools.length,
                })}
          </p>
          <div className="-mx-2 px-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <ToolTree
              tools={tools}
              selected={value}
              onChange={onChange}
              query={query}
            />
          </div>
        </>
      )}
    </div>
  )
}

// Two panes: connections and secrets on the left (plus `extra`), the open connection's tools
// on the right. `projectName` prefixes names with their project, for picks across projects.
export function AccessPicker({
  connections,
  secrets,
  skills = [],
  value,
  onChange,
  projectName,
  extra,
}: {
  connections: Connection[]
  secrets: Secret[]
  skills?: Skill[]
  value: AccessValue
  onChange: (value: AccessValue) => void
  projectName?: (projectId: string) => string | undefined
  extra?: ReactNode
}) {
  const { t } = useI18n()
  const [active, setActive] = useState(value.connectionIds[0])
  const [tools, setTools] = useState<Record<string, Tool[]>>({})
  const [toolErrors, setToolErrors] = useState<Record<string, string>>({})
  const activeConn = connections.find((c) => c.id === active)
  const label = (projectId: string, name: string) =>
    projectName ? `${projectName(projectId) ?? "?"} / ${name}` : name
  const toolSummary = (list: string[] | null | undefined) =>
    list == null
      ? t("scopes.chipAll")
      : t("scopes.chipCount", { n: list.length })

  // Loads the tools of the connection open in the pane (once per connection).
  useEffect(() => {
    if (!active || tools[active] || toolErrors[active]) return
    api<Tool[]>(`/connections/${active}/tools`)
      .then((list) => setTools((prev) => ({ ...prev, [active]: list })))
      .catch((err: Error) =>
        setToolErrors((prev) => ({ ...prev, [active]: err.message }))
      )
  }, [active, tools, toolErrors])

  function togglePicked(id: string, checked: boolean) {
    onChange({
      ...value,
      connectionIds: checked
        ? [...value.connectionIds, id]
        : value.connectionIds.filter((x) => x !== id),
    })
    if (checked) setActive(id)
  }

  return (
    <div className="flex flex-col gap-4 md:grid md:min-h-0 md:flex-1 md:grid-cols-[minmax(240px,300px)_1fr]">
      {/* Connections */}
      <div className="bg-muted/40 ring-border flex max-h-48 flex-col gap-1 overflow-y-auto rounded-2xl p-2 ring-1 ring-inset md:max-h-none md:min-h-0">
        <span className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs font-medium">
          {t("scopes.connections")}
        </span>
        {connections.length === 0 && (
          <p className="text-muted-foreground px-2 text-sm">
            {t("scopes.createConnectionFirst")}
          </p>
        )}
        {connections.map((c) => {
          const included = value.connectionIds.includes(c.id)
          const list = value.allowedTools[c.id]
          return (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors",
                active === c.id
                  ? "bg-card ring-border shadow-[var(--shadow-surface)] ring-1"
                  : "hover:bg-card/60"
              )}
            >
              <Checkbox
                checked={included}
                onCheckedChange={(checked) => togglePicked(c.id, checked)}
                aria-label={c.name}
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col text-left outline-none"
                onClick={() => setActive(c.id)}
              >
                <span className="truncate text-sm font-medium">
                  {label(c.projectId, c.name)}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {included ? toolSummary(list) : t("scopes.notIncluded")}
                </span>
              </button>
            </div>
          )
        })}
        {secrets.length > 0 && (
          <>
            <span className="text-muted-foreground mt-3 px-2 pt-1 pb-1.5 text-xs font-medium">
              {t("scopes.secrets")}
            </span>
            {secrets.map((x) => (
              <div
                key={x.id}
                className="hover:bg-card/60 flex items-center gap-2.5 rounded-xl px-2 py-2"
              >
                <Checkbox
                  id={`sec-${x.id}`}
                  checked={value.secretIds.includes(x.id)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      secretIds: checked
                        ? [...value.secretIds, x.id]
                        : value.secretIds.filter((id) => id !== x.id),
                    })
                  }
                />
                <label
                  htmlFor={`sec-${x.id}`}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col"
                >
                  <span className="truncate font-mono text-xs font-medium">
                    {label(x.projectId, x.name)}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {x.agentAccess
                      ? t("scopes.secretAgents")
                      : t("scopes.secretRest")}
                  </span>
                </label>
              </div>
            ))}
          </>
        )}
        {skills.length > 0 && (
          <>
            <span className="text-muted-foreground mt-3 px-2 pt-1 pb-1.5 text-xs font-medium">
              {t("scopes.skills")}
            </span>
            {skills.map((sk) => (
              <div
                key={sk.id}
                className="hover:bg-card/60 flex items-center gap-2.5 rounded-xl px-2 py-2"
              >
                <Checkbox
                  id={`sk-${sk.id}`}
                  checked={value.skillIds.includes(sk.id)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      skillIds: checked
                        ? [...value.skillIds, sk.id]
                        : value.skillIds.filter((id) => id !== sk.id),
                    })
                  }
                />
                <label
                  htmlFor={`sk-${sk.id}`}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col"
                >
                  <span className="truncate font-mono text-xs font-medium">
                    {label(sk.projectId, sk.slug)}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    v{sk.activeVersion}
                  </span>
                </label>
              </div>
            ))}
          </>
        )}
        {extra}
      </div>

      {/* Tools */}
      <div className="ring-border flex min-h-64 flex-col rounded-2xl p-4 ring-1 ring-inset md:min-h-0">
        {!activeConn ? (
          <div className="text-muted-foreground m-auto flex max-w-xs flex-col items-center gap-2 text-center text-sm">
            <SlidersHorizontalIcon className="size-6" />
            {t("scopes.pickConnection")}
          </div>
        ) : !value.connectionIds.includes(activeConn.id) ? (
          <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
            <Monogram name={activeConn.name} />
            <p className="text-muted-foreground text-sm">
              {t("scopes.notIncludedHint", { name: activeConn.name })}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => togglePicked(activeConn.id, true)}
            >
              <PlusIcon />
              {t("scopes.include")}
            </Button>
          </div>
        ) : (
          <ToolPanel
            connection={activeConn}
            tools={tools[activeConn.id]}
            error={toolErrors[activeConn.id]}
            value={value.allowedTools[activeConn.id] ?? null}
            onChange={(list) =>
              onChange({
                ...value,
                allowedTools: { ...value.allowedTools, [activeConn.id]: list },
              })
            }
          />
        )}
      </div>
    </div>
  )
}
