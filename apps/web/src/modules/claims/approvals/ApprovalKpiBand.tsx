import { AlertTriangle, CircleCheck, Clock, Flag, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ApprovalSummary } from "../api"

function money(v: string): string {
  const n = Number(v)
  return Number.isFinite(n) ? `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 0 })}` : v
}

export interface ApprovalKpiBandProps {
  summary: ApprovalSummary | null
  overdueActive: boolean
  highValueActive: boolean
  onToggleOverdue: () => void
  onToggleHighValue: () => void
}

export function ApprovalKpiBand({
  summary,
  overdueActive,
  highValueActive,
  onToggleOverdue,
  onToggleHighValue,
}: ApprovalKpiBandProps) {
  const s = summary
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-subtle">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 140% at 12% -20%, rgb(124 92 255 / 0.28), transparent 60%)",
        }}
      />
      <div className="relative p-4">
        <p className="layer-eyebrow text-accent-200 mb-3">Claims · awaiting your review</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <Tile
            icon={<CircleCheck className="size-4" />}
            label="Awaiting you"
            value={s ? String(s.awaiting_count) : "—"}
            tone="text-text-primary"
          />
          <Tile
            icon={<Wallet className="size-4" />}
            label="Pending value"
            value={s ? money(s.pending_value) : "—"}
            tone="text-text-primary"
          />
          <TileButton
            icon={<Clock className="size-4" />}
            label="Oldest / overdue"
            value={s ? `${s.oldest_days}d · ${s.overdue_count}` : "—"}
            tone="coral"
            active={overdueActive}
            onClick={onToggleOverdue}
          />
          <TileButton
            icon={<Flag className="size-4" />}
            label="High value"
            value={s ? String(s.high_value_count) : "—"}
            tone="yellow"
            active={highValueActive}
            onClick={onToggleHighValue}
          />
          <Tile
            icon={<AlertTriangle className="size-4 opacity-0" />}
            label="Approved / week"
            value={s ? String(s.approved_this_week) : "—"}
            tone="text-mint"
          />
        </div>
      </div>
    </section>
  )
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="rounded-xl bg-white/[0.06] border border-white/[0.08] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-text-tertiary text-[10px] tracking-wide uppercase">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-xl font-light tabular-nums mt-0.5 truncate", tone)}>{value}</div>
    </div>
  )
}

function TileButton({
  icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: "coral" | "yellow"
  active: boolean
  onClick: () => void
}) {
  const toneText = tone === "coral" ? "text-coral" : "text-yellow"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-left rounded-xl px-3 py-2.5 border transition-colors",
        tone === "coral" ? "bg-coral/10 border-coral/25" : "bg-yellow/10 border-yellow/25",
        active && "ring-2 ring-inset",
        active && (tone === "coral" ? "ring-coral/60" : "ring-yellow/60"),
      )}
    >
      <div
        className={cn("flex items-center gap-1.5 text-[10px] tracking-wide uppercase", toneText)}
      >
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-xl font-light tabular-nums mt-0.5 truncate", toneText)}>{value}</div>
    </button>
  )
}
