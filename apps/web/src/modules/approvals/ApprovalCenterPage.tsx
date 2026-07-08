import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/shell/PageHeader"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"

import { APPROVAL_SEGMENTS, type SegmentKey } from "./approval-registry"
import { useApprovalInbox } from "./useApprovalInbox"

export default function ApprovalCenterPage() {
  const inbox = useApprovalInbox()
  const [params, setParams] = useSearchParams()
  const requested = (params.get("type") as SegmentKey | null) ?? "all"

  // All hooks called unconditionally (rules of hooks).
  const canClaimTeam = useCan("claim:approve:team")
  const canClaimFinance = useCan("claim:approve:finance")
  const canLeave = useCan("leave:request:approve:team")
  const perms = { claim: canClaimTeam || canClaimFinance, leave: canLeave }

  // A segment shows if the user holds its perm (or it's "always"), or its badge > 0.
  const visible = useMemo(
    () =>
      APPROVAL_SEGMENTS.filter((s) => {
        if (s.anyPerm.includes("")) return true
        const badge = s.badge?.(inbox.items) ?? 0
        if (badge > 0) return true
        if (s.key === "claim") return perms.claim
        if (s.key === "leave") return perms.leave
        return false
      }),
    [inbox.items, perms.claim, perms.leave],
  )

  const active = visible.find((s) => s.key === requested) ?? visible[0]

  function select(key: SegmentKey) {
    const next = new URLSearchParams(params)
    next.set("type", key)
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Approvals"
        subtitle="One place to review and act on everything awaiting you."
      />

      <div className="flex flex-wrap gap-2">
        {visible.map((s) => {
          const badge = s.badge?.(inbox.items) ?? 0
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => select(s.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-small font-semibold border transition-colors",
                active?.key === s.key
                  ? "border-accent-500 bg-accent-500/15 text-text-primary"
                  : "border-border-subtle text-text-tertiary hover:text-text-secondary",
              )}
            >
              {s.label}
              {s.key === "all" ? (
                <span className="tabular-nums">· {inbox.items.length}</span>
              ) : badge > 0 ? (
                <span className="rounded-full bg-accent-500/25 text-accent-100 px-1.5 text-[10px] tabular-nums">
                  {badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {active ? (
        <active.Component inbox={inbox} onChanged={inbox.refresh} />
      ) : (
        <div className="bg-surface-hover border border-dashed border-border-subtle rounded-xl p-10 text-center text-text-tertiary">
          Nothing awaiting your approval.
        </div>
      )}
    </div>
  )
}
