import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Mail,
  MoreHorizontal,
  UserRound,
} from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { StatusPill } from "@/components/hrms"
import { employeeStatusTone, gradientFromName } from "@/components/hrms/avatar-gradient"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"
import { tenureFromHireDate } from "@/modules/employee/lib/format"
import type { Tone } from "@/modules/schedule/lib/cell-tone"

import { departmentTone } from "./dept-color"
import type { OrgNode } from "./types"

const TONE_CHIP: Record<Tone, string> = {
  accent: "bg-accent-500/15 text-accent-200",
  lavender: "bg-lavender/15 text-lavender",
  sky: "bg-sky/15 text-sky",
  yellow: "bg-yellow/15 text-yellow",
  mint: "bg-mint/15 text-mint",
  peach: "bg-peach/15 text-peach",
  coral: "bg-coral/15 text-coral",
}

const TONE_BAR: Record<Tone, string> = {
  accent: "bg-accent-500",
  lavender: "bg-lavender",
  sky: "bg-sky",
  yellow: "bg-yellow",
  mint: "bg-mint",
  peach: "bg-peach",
  coral: "bg-coral",
}

const TONE_DOT = TONE_BAR

export type CardDensity = "comfortable" | "compact"

export interface OrgNodeCardProps {
  node: OrgNode
  density?: CardDensity
  expanded?: boolean
  dimmed?: boolean
  highlighted?: boolean
  onToggle?: (id: string) => void
  onFocus?: (id: string) => void
}

export function OrgNodeCard({
  node,
  density = "comfortable",
  expanded = false,
  dimmed = false,
  highlighted = false,
  onToggle,
  onFocus,
}: OrgNodeCardProps) {
  const canAssign = useCan("assignment:create:org") || useCan("assignment:create:team")
  const status = employeeStatusTone(node.status ?? undefined)
  const tone = departmentTone(node.department_id ?? node.department_name)

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${node.full_name}`}
          className="size-6 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60 shrink-0"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/employees/${node.id}`}>
            <UserRound className="size-4 mr-2" /> View profile
          </Link>
        </DropdownMenuItem>
        {canAssign && (
          <DropdownMenuItem asChild>
            <Link to={`/admin/assignments/new?assignee=${node.id}`}>
              <Crosshair className="size-4 mr-2" /> Assign task
            </Link>
          </DropdownMenuItem>
        )}
        {node.email && (
          <DropdownMenuItem asChild>
            <a href={`mailto:${node.email}`}>
              <Mail className="size-4 mr-2" /> Email
            </a>
          </DropdownMenuItem>
        )}
        {onFocus && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onFocus(node.id)}>
              <Crosshair className="size-4 mr-2" /> Focus subtree
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const reportsToggle = node.has_reports ? (
    <button
      type="button"
      aria-label={`${expanded ? "Collapse" : "Expand"} ${node.full_name}`}
      onClick={() => onToggle?.(node.id)}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-secondary rounded-full bg-surface-elevated/70 px-2 py-0.5 hover:bg-surface-elevated shrink-0"
    >
      {node.direct_reports_count}
      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  ) : null

  if (density === "compact") {
    return (
      <CardShell dimmed={dimmed} highlighted={highlighted} className="w-[210px] px-3 py-2">
        <div className="flex items-center gap-2.5">
          <Avatar node={node} size={32} rounded="rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-text-primary truncate">
              {node.full_name}
            </p>
            <p className="text-[10px] text-text-tertiary truncate">
              {[node.role_title, node.department_name].filter(Boolean).join(" · ")}
            </p>
          </div>
          {reportsToggle}
          {menu}
        </div>
      </CardShell>
    )
  }

  const tenure = tenureFromHireDate(node.hire_date ?? undefined)

  return (
    <CardShell
      dimmed={dimmed}
      highlighted={highlighted}
      className="group w-[252px] overflow-hidden hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 transition-transform motion-reduce:transition-none"
    >
      <div className={cn("h-1", TONE_BAR[tone])} />
      <div className="px-3.5 py-3">
        <div className="flex items-start gap-3">
          <Avatar node={node} size={46} rounded="rounded-full" ring />
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold text-text-primary truncate">{node.full_name}</p>
            {node.role_title && (
              <p className="text-[11px] text-text-tertiary truncate">{node.role_title}</p>
            )}
          </div>
          {menu}
        </div>

        <div className="flex items-center gap-1.5 mt-2.5">
          {node.department_name && (
            <span
              className={cn(
                "text-[10px] font-medium rounded-md px-1.5 py-0.5 truncate max-w-[52%]",
                TONE_CHIP[tone],
              )}
            >
              {node.department_name}
            </span>
          )}
          <StatusPill tone={status.tone} label={status.label} />
        </div>

        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border-subtle">
          <span className="text-[10px] text-text-tertiary truncate">
            {[tenure, node.manager_name ? `↑ ${node.manager_name}` : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {/* hover-revealed quick actions */}
            <span className="hidden group-hover:inline-flex items-center gap-1">
              <Link
                to={`/employees/${node.id}`}
                aria-label={`View ${node.full_name}'s profile`}
                className="size-6 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60"
              >
                <ArrowUpRight className="size-3.5" />
              </Link>
              {onFocus && (
                <button
                  type="button"
                  aria-label={`Focus on ${node.full_name}`}
                  onClick={() => onFocus(node.id)}
                  className="size-6 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60"
                >
                  <Crosshair className="size-3.5" />
                </button>
              )}
            </span>
            {reportsToggle}
          </span>
        </div>
      </div>
    </CardShell>
  )
}

function CardShell({
  children,
  dimmed,
  highlighted,
  className,
}: {
  children: ReactNode
  dimmed?: boolean
  highlighted?: boolean
  className?: string
}) {
  return (
    <article
      className={cn(
        "glass-surface rounded-2xl transition-opacity",
        dimmed && "opacity-40",
        highlighted && "ring-2 ring-accent-500/60",
        className,
      )}
    >
      {children}
    </article>
  )
}

function Avatar({
  node,
  size,
  rounded,
  ring,
}: {
  node: OrgNode
  size: number
  rounded: string
  ring?: boolean
}) {
  const [from, to] = gradientFromName(node.full_name)
  if (node.photo_url) {
    return (
      <img
        src={node.photo_url}
        alt={`${node.full_name} avatar`}
        className={cn("object-cover shrink-0", rounded, ring && "ring-2 ring-accent-500/30")}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      aria-hidden
      className={cn(
        "bg-gradient-to-br shrink-0",
        rounded,
        `from-${from}`,
        `to-${to}`,
        ring && "ring-2 ring-accent-500/30",
      )}
      style={{ width: size, height: size }}
    />
  )
}

export { TONE_DOT }
