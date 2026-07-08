import { Check, FileText, MoreHorizontal } from "lucide-react"

import { StatusPill } from "@/components/hrms"
import { gradientFromName } from "@/components/hrms/avatar-gradient"
import { TruncTip } from "@/components/hrms/overflow"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { ClaimApprovalRow as Row } from "../api"

function money(row: Row): string {
  const n = Number(row.amount)
  const v = Number.isFinite(n)
    ? n.toLocaleString("en-MY", { minimumFractionDigits: 2 })
    : row.amount
  return `${row.currency_code} ${v}`
}

function ageLabel(row: Row): string {
  if (row.is_overdue) return `⏱ overdue ${row.age_days}d`
  if (!row.submitted_at) return ""
  return `${row.age_days === 0 ? "today" : `${row.age_days}d ago`}`
}

export interface ClaimApprovalRowProps {
  row: Row
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onApprove: () => void
}

export function ClaimApprovalRow({
  row,
  selected,
  onToggleSelect,
  onOpen,
  onApprove,
}: ClaimApprovalRowProps) {
  const [from, to] = gradientFromName(row.employee_name || row.employee_code)
  const context = [
    row.category_name,
    row.merchant,
    row.attachments_count ? `📎 ${row.attachments_count}` : null,
    ageLabel(row),
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border bg-surface-hover px-3 py-2.5",
        row.is_overdue
          ? "border-l-2 border-l-coral border-y-border-subtle border-r-border-subtle"
          : "border-border-subtle",
        row.is_high_value && !row.is_overdue && "border-l-2 border-l-yellow",
        selected && "ring-1 ring-accent-500/60",
      )}
    >
      {row.actionable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${row.employee_name}'s claim`}
          className="shrink-0"
        />
      ) : (
        // Non-actionable rows (already approved/rejected, or not at your stage) can't
        // be selected — keeps the layout aligned without an interactive checkbox.
        <span aria-hidden className="w-[13px] shrink-0" />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "size-8 rounded-full bg-gradient-to-br shrink-0",
            `from-${from}`,
            `to-${to}`,
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <TruncTip
              text={row.employee_name}
              className="text-small font-semibold text-text-primary"
            />
            {row.employee_role_title && (
              <span className="min-w-0 shrink truncate text-[11px] text-text-tertiary">
                {row.employee_role_title}
              </span>
            )}
          </span>
          <TruncTip text={context} className="text-[11px] text-text-tertiary" />
        </span>
      </button>

      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-small font-semibold tabular-nums",
            row.is_high_value ? "text-yellow" : "text-text-primary",
          )}
        >
          {money(row)}
        </div>
        <StatusPill tone={row.is_high_value ? "yellow" : "sky"} label={row.stage_label} />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {row.actionable && (
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-1 bg-accent-500 text-canvas text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
          >
            <Check className="size-3.5" /> Approve
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${row.employee_name}`}
              className="size-7 grid place-items-center rounded-lg border border-border-subtle text-text-tertiary hover:text-text-primary"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>
              <FileText className="size-4 mr-2" /> Review details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpen} className="text-coral focus:text-coral">
              Reject…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
