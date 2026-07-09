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
import { formatRange } from "@/modules/leave/lib/leave-dates"

import type { InboxItem } from "../api"
import { isInboxOverdue } from "../lib/inbox-filter"
import type { Clash } from "../useApprovalInbox"

const KIND_LABEL = { claim: "Claim", leave: "Leave", kpi: "KPI" } as const
const KIND_TONE = { claim: "peach", leave: "yellow", kpi: "sky" } as const

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "")
}

function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** The one-glance focal value for a typed row. */
function focal(item: InboxItem): string {
  const d = item.detail
  if (item.kind === "claim") return `${str(d.currency_code)} ${str(d.amount)}`
  if (item.kind === "leave") return `${str(d.total_days)} days`
  return "Self-review"
}

/** The stage/context pill on a typed row. */
function pill(item: InboxItem): { tone: "sky" | "lavender"; label: string } {
  return item.kind === "kpi"
    ? { tone: "sky", label: "Your review" }
    : { tone: "lavender", label: "Manager" }
}

/** The muted context line under the name. */
function context(item: InboxItem, clash?: Clash): string {
  const d = item.detail
  const age = isInboxOverdue(item) ? `overdue` : timeAgo(item.submitted_at)
  if (item.kind === "leave") {
    const cov = (clash?.count ?? 0) > 0 ? `⚠ ${clash?.count} off` : "no clash ✓"
    return [item.type_code, formatRange(str(d.start_date), str(d.end_date)), cov, age]
      .filter(Boolean)
      .join(" · ")
  }
  if (item.kind === "kpi") {
    return [`${str(d.cycle)} cycle`, "self-review", age].filter(Boolean).join(" · ")
  }
  // claim (only surfaces in the "all" variant)
  return [item.type_code, str(d.merchant), age].filter(Boolean).join(" · ")
}

/** The compact one-liner for the "all" (cross-type) variant. */
function allSummary(item: InboxItem, clash?: Clash): string {
  const d = item.detail
  if (item.kind === "claim")
    return [`${str(d.currency_code)} ${str(d.amount)}`, str(d.merchant), item.type_code]
      .filter(Boolean)
      .join(" · ")
  if (item.kind === "leave") {
    const cov = (clash?.count ?? 0) > 0 ? `⚠ ${clash?.count} off` : null
    return [
      `${str(d.total_days)} days`,
      item.type_code,
      formatRange(str(d.start_date), str(d.end_date)),
      cov,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  return [`${str(d.cycle)} cycle`, "self-review ready"].filter(Boolean).join(" · ")
}

/** Queue rows (Leave history tabs) carry decision flags; inbox rows don't. */
export type ApprovalRowItem = InboxItem & {
  actionable?: boolean
  is_overdue?: boolean
  is_conflict?: boolean
}

export interface ApprovalRowProps {
  item: ApprovalRowItem
  clash?: Clash
  variant: "typed" | "all"
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onApprove: () => void
  busy?: boolean
}

/** One dense approval row for any inbox item — mirrors the Claims ClaimApprovalRow
 * chrome. KPI is Review-first (no reject); leave/claim get an inline Approve. */
export function ApprovalRow({
  item,
  clash,
  variant,
  selected,
  onToggleSelect,
  onOpen,
  onApprove,
  busy = false,
}: ApprovalRowProps) {
  const name = item.name || item.employee_code
  const [from, to] = gradientFromName(name)
  const actionable = item.actionable ?? true
  const overdue = item.is_overdue ?? isInboxOverdue(item)
  const clashing = (clash?.count ?? 0) > 0 || item.is_conflict === true
  const reviewFirst = item.kind === "kpi"
  const canReject = actionable && item.kind !== "kpi"

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border bg-surface-hover px-3 py-2.5",
        overdue
          ? "border-l-2 border-l-coral border-y-border-subtle border-r-border-subtle"
          : clashing
            ? "border-l-2 border-l-yellow border-y-border-subtle border-r-border-subtle"
            : "border-border-subtle",
        selected && "ring-1 ring-accent-500/60",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${name}'s ${item.kind}`}
        className="shrink-0"
      />

      {variant === "all" ? (
        <StatusPill tone={KIND_TONE[item.kind]} label={KIND_LABEL[item.kind]} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-8 rounded-full bg-gradient-to-br shrink-0",
            `from-${from}`,
            `to-${to}`,
          )}
        />
      )}

      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="flex items-baseline gap-2">
          <TruncTip text={name} className="text-small font-semibold text-text-primary" />
          {variant === "typed" && item.department && (
            <span className="min-w-0 shrink truncate text-[11px] text-text-tertiary">
              {item.department}
            </span>
          )}
        </span>
        <TruncTip
          text={variant === "all" ? allSummary(item, clash) : context(item, clash)}
          className="text-[11px] text-text-tertiary"
        />
      </button>

      {variant === "typed" ? (
        <div className="text-right shrink-0">
          <div className="text-small font-semibold tabular-nums text-text-primary">
            {focal(item)}
          </div>
          <StatusPill tone={pill(item).tone} label={pill(item).label} />
        </div>
      ) : (
        <span className="text-[11px] text-text-tertiary shrink-0">
          {overdue ? "overdue" : timeAgo(item.submitted_at)}
        </span>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        {actionable &&
          (reviewFirst ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1 border border-accent-500/60 text-accent-100 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
            >
              Review
            </button>
          ) : (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1 bg-accent-500 text-canvas text-[11px] font-semibold px-2.5 py-1.5 rounded-lg",
                busy && "opacity-60 cursor-not-allowed",
              )}
            >
              <Check className="size-3.5" /> Approve
            </button>
          ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${name}`}
              className="size-7 grid place-items-center rounded-lg border border-border-subtle text-text-tertiary hover:text-text-primary"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>
              <FileText className="size-4 mr-2" /> Review details
            </DropdownMenuItem>
            {canReject && (
              <DropdownMenuItem onClick={onOpen} className="text-coral focus:text-coral">
                Reject…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
