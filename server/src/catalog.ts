import { plugins } from "./native/index.js"
import type { NativeFeature, NativeField, Text } from "./native/types.js"

// One-click connections. Each entry fills in one of the existing kinds: a remote MCP server
// (OAuth, or a key in a header), a local MCP server (a command with a key in its environment),
// or a native plugin. A custom connection is still made with the full form.
//
// Addresses and key formats come from each vendor's documentation; servers that use OAuth
// register keyhall as a client on the first sign-in.

export type CatalogKey = {
  label: Text
  hint?: Text
  // Where to get the key.
  url?: string
  placeholder?: string
}

export type CatalogConnect =
  | { kind: "mcp"; url: string }
  | {
      kind: "mcp"
      url: string
      // optional: the server signs in with OAuth when no key is given, and takes the key on the
      // same address (or on endpoint, when the vendor uses another one for keys).
      key: CatalogKey & {
        header: string
        prefix: string
        optional?: boolean
        endpoint?: string
      }
    }
  | {
      kind: "stdio"
      command: string
      args: string[]
      key: CatalogKey & { env: string }
    }
  | {
      kind: "native"
      plugin: string
      // One service per entry: the connection gets only these features' tools and scopes.
      features: string[]
      guide?: string
      // Setup steps at the provider, e.g. enabling the API in the Cloud project.
      links?: { label: Text; url: string }[]
    }

export type CatalogEntry = {
  slug: string
  name: string
  // The vendor's own icon. keyhall downloads it and serves it to the panel, so viewers never
  // load images from third parties.
  iconUrl: string
  category: "productivity" | "dev" | "infra" | "data" | "search" | "design"
  tagline: Text
  website: string
  connect: CatalogConnect
}

const oauth = (url: string): CatalogConnect => ({ kind: "mcp", url })

const bearer = (
  url: string,
  label: Text,
  keyUrl: string,
  placeholder?: string
): CatalogConnect => ({
  kind: "mcp",
  url,
  key: {
    header: "Authorization",
    prefix: "Bearer ",
    label,
    url: keyUrl,
    placeholder,
  },
})

const API_KEY: Text = { en: "API key", pt: "Chave da API" }

// OAuth by default; a key in a header instead, for accounts or setups without a browser sign-in.
const oauthOrKey = (
  url: string,
  keyUrl: string,
  options: {
    label?: Text
    placeholder?: string
    header?: string
    prefix?: string
    endpoint?: string
  } = {}
): CatalogConnect => ({
  kind: "mcp",
  url,
  key: {
    header: options.header ?? "Authorization",
    prefix: options.prefix ?? "Bearer ",
    label: options.label ?? API_KEY,
    url: keyUrl,
    placeholder: options.placeholder,
    optional: true,
    endpoint: options.endpoint,
  },
})

const npx = (pkg: string, env: string, keyUrl: string): CatalogConnect => ({
  kind: "stdio",
  command: "npx",
  args: ["-y", pkg],
  key: { env, label: { en: "API key", pt: "Chave da API" }, url: keyUrl },
})

const GOOGLE_GUIDE =
  "https://github.com/luizgustavosaraiva/keyhall/blob/main/docs/google.md"

export const catalog: CatalogEntry[] = [
  {
    slug: "gmail",
    name: "Gmail",
    iconUrl:
      "https://ssl.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png",
    category: "productivity",
    tagline: {
      en: "Search, read, draft and send email",
      pt: "Buscar, ler, rascunhar e enviar e-mails",
    },
    website: "https://mail.google.com",
    connect: {
      kind: "native",
      plugin: "google",
      features: ["gmail"],
      guide: GOOGLE_GUIDE,
      links: [
        {
          label: { en: "Enable the Gmail API", pt: "Ativar a Gmail API" },
          url: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
        },
      ],
    },
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    iconUrl:
      "https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png",
    category: "productivity",
    tagline: {
      en: "Search and read files, Docs as text",
      pt: "Buscar e ler arquivos, Docs como texto",
    },
    website: "https://drive.google.com",
    connect: {
      kind: "native",
      plugin: "google",
      features: ["drive"],
      guide: GOOGLE_GUIDE,
      links: [
        {
          label: {
            en: "Enable the Google Drive API",
            pt: "Ativar a Google Drive API",
          },
          url: "https://console.cloud.google.com/apis/library/drive.googleapis.com",
        },
      ],
    },
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    iconUrl:
      "https://ssl.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png",
    category: "productivity",
    tagline: {
      en: "Read and write spreadsheets",
      pt: "Ler e escrever planilhas",
    },
    website: "https://sheets.google.com",
    connect: {
      kind: "native",
      plugin: "google",
      features: ["sheets"],
      guide: GOOGLE_GUIDE,
      links: [
        {
          label: {
            en: "Enable the Google Sheets API",
            pt: "Ativar a Google Sheets API",
          },
          url: "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
        },
      ],
    },
  },
  {
    slug: "notion",
    name: "Notion",
    iconUrl: "https://www.notion.so/images/favicon.ico",
    category: "productivity",
    tagline: {
      en: "Pages, databases and search",
      pt: "Páginas, bancos de dados e busca",
    },
    website: "https://www.notion.com",
    connect: oauth("https://mcp.notion.com/mcp"),
  },
  {
    slug: "linear",
    name: "Linear",
    iconUrl: "https://linear.app/favicon.ico",
    category: "productivity",
    tagline: {
      en: "Issues, projects and triage",
      pt: "Issues, projetos e triagem",
    },
    website: "https://linear.app",
    connect: oauthOrKey(
      "https://mcp.linear.app/mcp",
      "https://linear.app/docs/mcp",
      { placeholder: "lin_api_…" }
    ),
  },
  {
    slug: "atlassian",
    name: "Atlassian",
    iconUrl: "https://www.atlassian.com/favicon.ico",
    category: "productivity",
    tagline: {
      en: "Jira issues and Confluence pages",
      pt: "Issues do Jira e páginas do Confluence",
    },
    website: "https://www.atlassian.com",
    connect: oauth("https://mcp.atlassian.com/v2/mcp"),
  },
  {
    slug: "todoist",
    name: "Todoist",
    iconUrl: "https://www.todoist.com/static/apple-touch-icon.png",
    category: "productivity",
    tagline: { en: "Tasks and projects", pt: "Tarefas e projetos" },
    website: "https://todoist.com",
    connect: oauth("https://ai.todoist.net/mcp"),
  },
  {
    slug: "trello",
    name: "Trello",
    iconUrl: "https://trello.com/favicon.ico",
    category: "productivity",
    tagline: {
      en: "Boards, lists and cards",
      pt: "Quadros, listas e cartões",
    },
    website: "https://trello.com",
    connect: oauth("https://mcp.trello.com/v1"),
  },
  {
    slug: "canva",
    name: "Canva",
    iconUrl:
      "https://static.canva.com/static/images/apple-touch-icon-180x180.png",
    category: "design",
    tagline: {
      en: "Designs, assets and exports",
      pt: "Designs, recursos e exportações",
    },
    website: "https://www.canva.com",
    connect: oauth("https://mcp.canva.com/mcp"),
  },
  {
    slug: "airtable",
    name: "Airtable",
    iconUrl:
      "https://static.airtable.com/images/favicon/baymax/apple-touch-icon.png",
    category: "data",
    tagline: {
      en: "Bases, tables and records",
      pt: "Bases, tabelas e registros",
    },
    website: "https://airtable.com",
    connect: oauthOrKey(
      "https://mcp.airtable.com/mcp",
      "https://support.airtable.com/articles/9934989703-creating-personal-access-tokens",
      {
        label: { en: "Personal access token", pt: "Token de acesso pessoal" },
        placeholder: "pat…",
      }
    ),
  },
  {
    slug: "cloudflare",
    name: "Cloudflare",
    iconUrl: "https://developers.cloudflare.com/favicon.png",
    category: "infra",
    tagline: {
      en: "DNS, Workers and the whole Cloudflare API",
      pt: "DNS, Workers e toda a API da Cloudflare",
    },
    website: "https://www.cloudflare.com",
    connect: oauthOrKey(
      "https://mcp.cloudflare.com/mcp",
      "https://dash.cloudflare.com/profile/api-tokens",
      { label: { en: "API token", pt: "Token da API" } }
    ),
  },
  {
    slug: "vercel",
    name: "Vercel",
    iconUrl: "https://vercel.com/favicon.ico",
    category: "infra",
    tagline: {
      en: "Projects, deployments and logs",
      pt: "Projetos, deploys e logs",
    },
    website: "https://vercel.com",
    connect: oauth("https://mcp.vercel.com"),
  },
  {
    slug: "netlify",
    name: "Netlify",
    iconUrl: "https://www.netlify.com/favicon/apple-touch-icon.png",
    category: "infra",
    tagline: { en: "Sites and deploys", pt: "Sites e deploys" },
    website: "https://www.netlify.com",
    connect: oauth("https://netlify-mcp.netlify.app/mcp"),
  },
  {
    slug: "railway",
    name: "Railway",
    iconUrl: "https://railway.com/apple-touch-icon.png",
    category: "infra",
    tagline: {
      en: "Services, deploys and variables",
      pt: "Serviços, deploys e variáveis",
    },
    website: "https://railway.com",
    connect: oauth("https://mcp.railway.com"),
  },
  {
    slug: "render",
    name: "Render",
    iconUrl: "https://dashboard.render.com/favicon-light.png",
    category: "infra",
    tagline: {
      en: "Services, deploys and logs",
      pt: "Serviços, deploys e logs",
    },
    website: "https://render.com",
    connect: bearer(
      "https://mcp.render.com/mcp",
      { en: "API key", pt: "Chave da API" },
      "https://dashboard.render.com/u/settings?add-api-key",
      "rnd_…"
    ),
  },
  {
    slug: "supabase",
    name: "Supabase",
    iconUrl: "https://supabase.com/favicon/favicon.ico",
    category: "data",
    tagline: {
      en: "Postgres, auth and storage projects",
      pt: "Projetos com Postgres, auth e storage",
    },
    website: "https://supabase.com",
    connect: oauthOrKey(
      "https://mcp.supabase.com/mcp",
      "https://supabase.com/docs/guides/ai-tools/mcp",
      {
        label: { en: "Personal access token", pt: "Token de acesso pessoal" },
        placeholder: "sbp_…",
      }
    ),
  },
  {
    slug: "neon",
    name: "Neon",
    iconUrl: "https://neon.com/apple-touch-icon.png",
    category: "data",
    tagline: {
      en: "Serverless Postgres and branches",
      pt: "Postgres serverless e branches",
    },
    website: "https://neon.com",
    connect: oauthOrKey(
      "https://mcp.neon.tech/mcp",
      "https://neon.com/docs/ai/neon-mcp-server"
    ),
  },
  {
    slug: "prisma",
    name: "Prisma Postgres",
    iconUrl: "https://www.prisma.io/apple-icon.png",
    category: "data",
    tagline: {
      en: "Databases, migrations and backups",
      pt: "Bancos, migrações e backups",
    },
    website: "https://www.prisma.io",
    connect: oauth("https://mcp.prisma.io/mcp"),
  },
  {
    slug: "sentry",
    name: "Sentry",
    iconUrl: "https://sentry.io/favicon.ico",
    category: "dev",
    tagline: {
      en: "Errors, issues and releases",
      pt: "Erros, issues e releases",
    },
    website: "https://sentry.io",
    connect: oauth("https://mcp.sentry.dev/mcp"),
  },
  {
    slug: "posthog",
    name: "PostHog",
    iconUrl: "https://app.posthog.com/static/icons/apple-touch-icon.png",
    category: "data",
    tagline: {
      en: "Product analytics, flags and insights",
      pt: "Analytics de produto, flags e insights",
    },
    website: "https://posthog.com",
    connect: oauthOrKey(
      "https://mcp.posthog.com/mcp",
      "https://posthog.com/docs/model-context-protocol/faq",
      {
        label: { en: "Personal API key", pt: "Chave pessoal da API" },
        placeholder: "phx_…",
      }
    ),
  },
  {
    slug: "stripe",
    name: "Stripe",
    iconUrl: "https://stripe.com/favicon.ico",
    category: "dev",
    tagline: {
      en: "Customers, payments and docs",
      pt: "Clientes, pagamentos e documentação",
    },
    website: "https://stripe.com",
    connect: oauthOrKey(
      "https://mcp.stripe.com",
      "https://docs.stripe.com/mcp",
      {
        label: { en: "Restricted key", pt: "Chave restrita" },
        placeholder: "rk_…",
      }
    ),
  },
  {
    slug: "resend",
    name: "Resend",
    iconUrl: "https://resend.com/static/favicons/favicon.ico",
    category: "dev",
    tagline: {
      en: "Send email and manage domains",
      pt: "Enviar e-mails e gerenciar domínios",
    },
    website: "https://resend.com",
    connect: oauthOrKey(
      "https://mcp.resend.com/mcp",
      "https://resend.com/changelog/remote-mcp-server",
      { placeholder: "re_…" }
    ),
  },
  {
    slug: "context7",
    name: "Context7",
    iconUrl: "https://context7.com/favicon.ico",
    category: "dev",
    tagline: {
      en: "Up-to-date library docs",
      pt: "Documentação atualizada de bibliotecas",
    },
    website: "https://context7.com",
    connect: oauthOrKey(
      "https://mcp.context7.com/mcp",
      "https://context7.com/docs/installation",
      { header: "CONTEXT7_API_KEY", prefix: "" }
    ),
  },
  {
    slug: "huggingface",
    name: "Hugging Face",
    iconUrl: "https://huggingface.co/favicon.ico",
    category: "dev",
    tagline: {
      en: "Models, datasets and Spaces",
      pt: "Modelos, datasets e Spaces",
    },
    website: "https://huggingface.co",
    connect: oauthOrKey(
      "https://huggingface.co/mcp",
      "https://huggingface.co/settings/tokens",
      {
        label: { en: "Access token", pt: "Token de acesso" },
        placeholder: "hf_…",
      }
    ),
  },
  {
    slug: "brave-search",
    name: "Brave Search",
    iconUrl: "https://brave.com/favicon.ico",
    category: "search",
    tagline: { en: "Web and news search", pt: "Busca na web e notícias" },
    website: "https://brave.com/search/api/",
    connect: npx(
      "@brave/brave-search-mcp-server",
      "BRAVE_API_KEY",
      "https://brave.com/search/api/"
    ),
  },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    iconUrl: "https://www.firecrawl.dev/favicon.ico",
    category: "search",
    tagline: {
      en: "Scrape and crawl websites",
      pt: "Extrair e rastrear sites",
    },
    website: "https://www.firecrawl.dev",
    connect: oauthOrKey(
      "https://mcp.firecrawl.dev/v2/mcp-oauth",
      "https://docs.firecrawl.dev/mcp-server/connect",
      { placeholder: "fc-…", endpoint: "https://mcp.firecrawl.dev/v2/mcp" }
    ),
  },
]

export const catalogEntry = (slug: string | null | undefined) =>
  slug ? catalog.find((e) => e.slug === slug) : undefined

// What the panel needs: the entries, and the fields and features of each native plugin.
export function publicCatalog(stdio: boolean) {
  const native: Record<
    string,
    {
      fields: NativeField[]
      features: NativeFeature[]
      vaultName: string
      consoleUrl: string
    }
  > = {}
  for (const [id, p] of Object.entries(plugins))
    native[id] = {
      fields: p.fields,
      features: p.features,
      vaultName: p.vaultName,
      consoleUrl: p.consoleUrl,
    }
  return {
    entries: catalog
      .filter((e) => stdio || e.connect.kind !== "stdio")
      .map(({ iconUrl: _, ...e }) => ({
        ...e,
        icon: `/api/admin/catalog/${e.slug}/icon`,
      })),
    native,
  }
}

// Icons are kept in memory: each is downloaded once per process. A failed download is
// retried after an hour.
const MAX_ICON = 512 * 1024
const icons = new Map<string, Icon>()
const failed = new Map<string, number>()

export type Icon = { body: Buffer; type: string }

export async function catalogIcon(slug: string): Promise<Icon | null> {
  const entry = catalogEntry(slug)
  if (!entry) return null
  const hit = icons.get(slug)
  if (hit) return hit
  if ((failed.get(slug) ?? 0) > Date.now()) return null
  try {
    const res = await fetch(entry.iconUrl, {
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
      // Some sites (Notion) refuse requests without a browser-like user agent.
      headers: { "user-agent": "Mozilla/5.0 (compatible; keyhall)" },
    })
    const type = res.headers.get("content-type")?.split(";")[0] ?? ""
    const body = Buffer.from(await res.arrayBuffer())
    if (!res.ok || !type.startsWith("image/") || body.length > MAX_ICON)
      throw new Error(`icon ${slug}: ${res.status} ${type}`)
    const icon = { body, type }
    icons.set(slug, icon)
    return icon
  } catch {
    failed.set(slug, Date.now() + 3_600_000)
    return null
  }
}
