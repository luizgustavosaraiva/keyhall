import { LockKeyholeIcon, XIcon } from "lucide-react"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Project, Secret } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const isRef = (value: string) => /^\{\{\s*secret:[^}]+\}\}$/.test(value.trim())

// Key field that takes a typed value or a vault reference ({{secret:NAME}}).
// A reference stays visible (it's not secret); a typed value is masked.
export function SecretInput({
  id,
  name,
  defaultValue = "",
  placeholder,
  required,
  projectId,
  projects,
  secrets,
}: {
  id: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  // The connection's project: its secrets need no prefix.
  projectId: string
  projects: Project[]
  secrets: Secret[]
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(defaultValue)
  const ref = isRef(value)
  const local = secrets.filter((s) => s.projectId === projectId)
  const others = secrets.filter((s) => s.projectId !== projectId)
  const slugOf = (pid: string) => projects.find((p) => p.id === pid)?.slug

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={ref ? "text" : "password"}
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={cn(
          "pr-18",
          ref && "font-mono text-amber-700 dark:text-primary"
        )}
      />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
        {ref && (
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setValue("")}
            aria-label={t("vault.clearRef")}
            title={t("vault.clearRef")}
          >
            <XIcon className="size-3.5" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground text-xs hover:bg-muted hover:text-foreground aria-expanded:bg-muted"
            aria-label={t("vault.useSecret")}
            title={t("vault.useSecret")}
          >
            <LockKeyholeIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("vault.useSecret")}</DropdownMenuLabel>
              {local.length === 0 && others.length === 0 && (
                <DropdownMenuItem disabled>
                  {t("vault.noneYet")}
                </DropdownMenuItem>
              )}
              {local.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => setValue(`{{secret:${s.name}}}`)}
                >
                  <span className="truncate font-mono text-xs">{s.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {others.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {t("vault.otherProjects")}
                  </DropdownMenuLabel>
                  {others.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      onClick={() =>
                        setValue(`{{secret:${slugOf(s.projectId)}/${s.name}}}`)
                      }
                    >
                      <span className="truncate font-mono text-xs">
                        {slugOf(s.projectId)}/{s.name}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
