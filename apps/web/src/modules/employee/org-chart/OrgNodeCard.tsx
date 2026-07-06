import { ChevronDown, ChevronRight, Crosshair, Mail, MoreHorizontal, UserRound } from "lucide-react"
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

export interface OrgNodeCardProps {
  node: OrgNode
  expanded?: boolean
  dimmed?: boolean
  highlighted?: boolean
  onToggle?: (id: string) => void
  onFocus?: (id: string) => void
}

export function OrgNodeCard({
  node,
  expanded = false,
  dimmed = false,
  highlighted = false,
  onToggle,
  onFocus,
}: OrgNodeCardProps) {
  const canAssign = useCan("assignment:create:org") || useCan("assignment:create:team")
  const status = employeeStatusTone(node.status ?? undefined)
  const [from, to] = gradientFromName(node.full_name)
  const chip = TONE_CHIP[departmentTone(node.department_id ?? node.department_name)]

  return (
    <article
      className={cn(
        "glass-surface rounded-2xl w-[248px] px-3.5 py-3 transition-opacity",
        dimmed && "opacity-40",
        highlighted && "ring-2 ring-accent-500/60",
      )}
    >
      <div className="flex items-start gap-3">
        {node.photo_url ? (
          <img
            src={node.photo_url}
            alt={`${node.full_name} avatar`}
            className="size-11 rounded-full object-cover border border-accent-500/25 shrink-0"
          />
        ) : (
          <div
            aria-hidden
            className={cn(
              "size-11 rounded-full bg-gradient-to-br border border-accent-500/25 shrink-0",
              `from-${from}`,
              `to-${to}`,
            )}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold text-text-primary truncate">{node.full_name}</p>
          {node.role_title && (
            <p className="text-[11px] text-text-tertiary truncate">{node.role_title}</p>
          )}
        </div>

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
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        {node.department_name && (
          <span className={cn("text-[10px] font-medium rounded-md px-1.5 py-0.5 truncate", chip)}>
            {node.department_name}
          </span>
        )}
        <StatusPill tone={status.tone} label={status.label} />
        {node.has_reports && (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.full_name}`}
            onClick={() => onToggle?.(node.id)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-secondary rounded-md px-1.5 py-0.5 hover:bg-surface-elevated/60 shrink-0"
          >
            {node.direct_reports_count}
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        )}
      </div>
    </article>
  )
}
