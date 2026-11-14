import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  KeyRoundIcon,
  LanguagesIcon,
  LayersIcon,
  LockKeyholeIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  QrCodeIcon,
  SunIcon,
  SwatchBookIcon,
  Trash2Icon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Org, Project, View } from "@/lib/api"
import { type Locale, locales, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type Page = "connections" | "scopes" | "secrets" | "tokens"

export type SidebarActions = {
  newOrg: () => void
  renameOrg: (org: Org) => void
  deleteOrg: (org: Org) => void
  newProject: () => void
  renameProject: (project: Project) => void
  deleteProject: (project: Project) => void
  changePassword: () => void
  devices: () => void
  signOut: () => void
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
  menu,
}: {
  active: boolean
  icon: ReactNode
  label: string
  count?: number
  onClick: () => void
  menu?: ReactNode
}) {
  return (
    <div className="group/item relative">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 [&_svg]:size-4 [&_svg]:shrink-0",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground dark:[&_svg]:text-primary font-medium [&_svg]:text-amber-600"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground [&_svg]:text-muted-foreground"
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span
            className={cn(
              "text-muted-foreground text-xs tabular-nums",
              menu && "group-hover/item:opacity-0 pointer-coarse:hidden"
            )}
          >
            {count}
          </span>
        )}
      </button>
      {/* Hover reveals the menu; touch screens have no hover, so it stays visible there. */}
      {menu && (
        <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
          {menu}
        </div>
      )}
    </div>
  )
}

function SectionLabel({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex h-8 items-center justify-between px-2.5">
      <span className="text-muted-foreground text-xs font-medium">
        {children}
      </span>
      {action}
    </div>
  )
}

const iconButton =
  "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"

export function AppSidebar({
  orgs,
  view,
  onViewChange,
  page,
  onPageChange,
  counts,
  user,
  actions,
}: {
  orgs: Org[]
  view: View
  onViewChange: (view: View) => void
  page: Page
  onPageChange: (page: Page) => void
  counts: Record<Page, number>
  user: { name: string; email: string }
  actions: SidebarActions
}) {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const { org } = view

  return (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
        <span className="font-brand text-lg tracking-tight">keyhall</span>
      </div>

      {/* Organization */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="bg-card ring-sidebar-border hover:bg-accent/40 focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-xl p-2 text-left shadow-[var(--shadow-surface)] ring-1 transition-colors outline-none focus-visible:ring-3"
          aria-label={t("org.switch")}
        >
          <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium">
            {org.name[0]?.toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{org.name}</span>
            <span className="text-muted-foreground text-xs">
              {t("org.label")}
            </span>
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("org.plural")}</DropdownMenuLabel>
            {orgs.map((o) => (
              <DropdownMenuItem
                key={o.id}
                onClick={() =>
                  onViewChange({ org: o, project: o.projects[0] ?? null })
                }
              >
                <Building2Icon />
                <span className="flex-1 truncate">{o.name}</span>
                {o.id === org.id && <CheckIcon />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={actions.newOrg}>
            <PlusIcon />
            {t("org.new")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.renameOrg(org)}>
            <PencilIcon />
            {t("org.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => actions.deleteOrg(org)}
          >
            <Trash2Icon />
            {t("org.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Projects */}
      <nav className="flex flex-col gap-0.5" aria-label={t("project.plural")}>
        <SectionLabel
          action={
            <button
              type="button"
              className={iconButton}
              onClick={actions.newProject}
              aria-label={t("project.new")}
              title={t("project.new")}
            >
              <PlusIcon />
            </button>
          }
        >
          {t("project.plural")}
        </SectionLabel>
        <NavItem
          active={!view.project}
          icon={<SwatchBookIcon />}
          label={t("project.all")}
          onClick={() => onViewChange({ org, project: null })}
        />
        {org.projects.map((p) => (
          <NavItem
            key={p.id}
            active={view.project?.id === p.id}
            icon={<FolderIcon />}
            label={p.name}
            onClick={() => onViewChange({ org, project: p })}
            menu={
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={iconButton}
                  aria-label={t("common.more")}
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => actions.renameProject(p)}>
                    <PencilIcon />
                    {t("common.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.deleteProject(p)}
                  >
                    <Trash2Icon />
                    {t("common.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
      </nav>

      {/* Pages */}
      <nav className="flex flex-col gap-0.5" aria-label={t("nav.manage")}>
        <SectionLabel>{t("nav.manage")}</SectionLabel>
        <NavItem
          active={page === "connections"}
          icon={<PlugIcon />}
          label={t("nav.connections")}
          count={counts.connections}
          onClick={() => onPageChange("connections")}
        />
        <NavItem
          active={page === "scopes"}
          icon={<LayersIcon />}
          label={t("nav.scopes")}
          count={counts.scopes}
          onClick={() => onPageChange("scopes")}
        />
        <NavItem
          active={page === "secrets"}
          icon={<LockKeyholeIcon />}
          label={t("nav.secrets")}
          count={counts.secrets}
          onClick={() => onPageChange("secrets")}
        />
        <NavItem
          active={page === "tokens"}
          icon={<KeyRoundIcon />}
          label={t("nav.tokens")}
          count={counts.tokens}
          onClick={() => onPageChange("tokens")}
        />
      </nav>

      {/* Account */}
      <div className="mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger className="hover:bg-sidebar-accent/70 focus-visible:ring-ring/50 aria-expanded:bg-sidebar-accent/70 flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors outline-none focus-visible:ring-3">
            <span className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium">
              {(user.name || user.email)[0]?.toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {user.name || user.email}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            </span>
            <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-60">
            <DropdownMenuItem onClick={actions.devices}>
              <QrCodeIcon />
              {t("devices.menu")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.changePassword}>
              <LockKeyholeIcon />
              {t("account.changePassword")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LanguagesIcon />
                {t("account.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={locale}
                  onValueChange={(v) => setLocale(v as Locale)}
                >
                  {locales.map((l) => (
                    <DropdownMenuRadioItem key={l.id} value={l.id}>
                      {l.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {theme === "dark" ? (
                  <MoonIcon />
                ) : theme === "light" ? (
                  <SunIcon />
                ) : (
                  <MonitorIcon />
                )}
                {t("account.theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(v) => setTheme(v as typeof theme)}
                >
                  <DropdownMenuRadioItem value="system">
                    {t("theme.system")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light">
                    {t("theme.light")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    {t("theme.dark")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={actions.signOut}>
              <LogOutIcon />
              {t("account.signOut")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <a
              href={`https://github.com/luizgustavosaraiva/keyhall/releases/tag/v${__APP_VERSION__}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground block px-2 py-1 text-xs"
            >
              keyhall v{__APP_VERSION__}
            </a>
            {/* Appropriate Legal Notices (AGPL-3.0, section 0) and the attribution in NOTICE. */}
            <p className="text-muted-foreground px-2 pb-1.5 text-xs leading-relaxed">
              {t("account.legal")}{" "}
              <a
                href="https://github.com/luizgustavosaraiva/keyhall"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline underline-offset-2"
              >
                {t("account.source")}
              </a>
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
