import { ChevronRightIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import type { Tool } from "@/lib/api"
import { cn } from "@/lib/utils"

type Token = { text: string; start: number; end: number }
type Item = { tool: Tool; tokens: Token[] }
type TreeNode = {
  id: string
  label: string
  names: string[]
  children: TreeNode[]
  tool?: Tool
}

// stripe_api_search, listMachines, get-user → name parts (snake, kebab and camelCase).
export function tokenize(name: string): Token[] {
  return [...name.matchAll(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g)].map(
    (m) => ({
      text: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    })
  )
}

const slice = (item: Item, from: number, to = item.tokens.length) =>
  item.tool.name.slice(item.tokens[from].start, item.tokens[to - 1].end)

// Groups by common prefix. A group needs 2+ tools; single-child chains
// collapse into one label (stripe → api → search, not s → t → r…).
export function build(
  items: Item[],
  depth: number,
  parent: string
): TreeNode[] {
  const groups = new Map<string, Item[]>()
  const nodes: TreeNode[] = []
  for (const item of items) {
    if (item.tokens.length <= depth) {
      // The tool ends exactly at the group prefix (e.g. stripe_api and stripe_api_read).
      nodes.push({
        id: `${parent}/=${item.tool.name}`,
        label: item.tool.name,
        names: [item.tool.name],
        children: [],
        tool: item.tool,
      })
      continue
    }
    const key = item.tokens[depth].text
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const [key, group] of groups) {
    const first = group[0]
    if (group.length === 1) {
      nodes.push({
        id: `${parent}/${first.tool.name}`,
        label: slice(first, depth),
        names: [first.tool.name],
        children: [],
        tool: first.tool,
      })
      continue
    }
    let end = depth + 1
    while (
      group.every((i) => i.tokens.length > end) &&
      group.every((i) => i.tokens[end].text === first.tokens[end].text)
    )
      end++
    const id = `${parent}/${key}`
    nodes.push({
      id,
      label: slice(first, depth, end),
      names: group.map((i) => i.tool.name),
      children: build(group, end, id),
    })
  }
  // Groups first, then loose tools; each block in alphabetical order.
  return nodes.sort(
    (a, b) =>
      Number(!!a.tool) - Number(!!b.tool) || a.label.localeCompare(b.label)
  )
}

export function ToolTree({
  tools,
  selected,
  onChange,
  query = "",
}: {
  tools: Tool[]
  selected: string[]
  onChange: (names: string[]) => void
  // Filters by name or description; while filtering, groups are expanded.
  query?: string
}) {
  const q = query.trim().toLowerCase()
  const tree = useMemo(
    () =>
      build(
        tools
          .filter(
            (tool) =>
              !q ||
              tool.name.toLowerCase().includes(q) ||
              tool.description?.toLowerCase().includes(q)
          )
          .map((tool) => ({ tool, tokens: tokenize(tool.name) })),
        0,
        ""
      ),
    [tools, q]
  )
  const [open, setOpen] = useState<Set<string>>(new Set())
  const chosen = new Set(selected)

  function toggle(names: string[], checked: boolean) {
    const next = new Set(selected)
    for (const n of names) {
      if (checked) next.add(n)
      else next.delete(n)
    }
    // Keeps the connection's order so the saved JSON stays stable.
    onChange(tools.map((t) => t.name).filter((n) => next.has(n)))
  }

  function render(nodes: TreeNode[], level: number) {
    return (
      <ul
        className={cn(
          "flex flex-col gap-px",
          level > 0 && "ml-[13px] border-l pl-2"
        )}
      >
        {nodes.map((node) => {
          const count = node.names.filter((n) => chosen.has(n)).length
          const all = count === node.names.length
          const expanded = !!q || open.has(node.id)
          return (
            <li key={node.id}>
              <div className="flex min-h-8 items-center gap-2 rounded-lg px-1 hover:bg-muted/70">
                {node.tool ? (
                  <span className="size-5 shrink-0" />
                ) : (
                  <button
                    type="button"
                    aria-label={expanded ? "Collapse" : "Expand"}
                    aria-expanded={expanded}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                    onClick={() =>
                      setOpen((prev) => {
                        const next = new Set(prev)
                        if (expanded) next.delete(node.id)
                        else next.add(node.id)
                        return next
                      })
                    }
                  >
                    <ChevronRightIcon
                      className={cn(
                        "size-4 transition-transform",
                        expanded && "rotate-90"
                      )}
                    />
                  </button>
                )}
                <Checkbox
                  checked={all}
                  indeterminate={count > 0 && !all}
                  onCheckedChange={(checked) => toggle(node.names, checked)}
                  aria-label={node.label}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 break-all font-mono text-xs",
                    !node.tool && "font-medium"
                  )}
                  title={node.tool?.description ?? node.names.join("\n")}
                >
                  {node.label}
                </span>
                {!node.tool && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 text-[0.7rem] text-muted-foreground tabular-nums">
                    {count}/{node.names.length}
                  </span>
                )}
              </div>
              {expanded && render(node.children, level + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  return render(tree, 0)
}
