import { CalendarPlus, Repeat } from "lucide-react"
import { Link } from "react-router-dom"

import { useAuth } from "@/lib/auth"

interface Props {
  /** null when no future shift is currently eligible for a swap. */
  nextSwappableAssignmentId: string | null
  onRequestSwap: (assignmentId: string) => void
}

const ITEM =
  "flex items-center gap-2 w-full text-left rounded-lg border border-border-subtle bg-surface-hover px-3 py-2 text-small text-text-primary hover:bg-surface-elevated disabled:opacity-50 disabled:hover:bg-surface-hover"

/**
 * Rail card — only actions that genuinely exist.
 *
 * Deliberately excludes "View Timesheet": `modules/attendance/` has no pages
 * and no routes, so the button would be a dead affordance. Tracked as a future
 * enhancement in the spec instead.
 */
export function QuickActionsCard({ nextSwappableAssignmentId, onRequestSwap }: Props) {
  const { perms } = useAuth()
  const canApplyLeave = perms.has("leave:request:create:self")
  const canSwap = perms.has("schedule:swap:request:self")

  if (!canApplyLeave && !canSwap) return null

  return (
    <section className="glass-surface rounded-2xl p-4">
      <h2 className="text-label uppercase text-text-tertiary mb-2">Quick actions</h2>
      <div className="flex flex-col gap-2">
        {canApplyLeave && (
          <Link to="/leave/apply" className={ITEM}>
            <CalendarPlus className="size-4" aria-hidden /> Apply for leave
          </Link>
        )}
        {canSwap && (
          <button
            type="button"
            disabled={nextSwappableAssignmentId === null}
            title={
              nextSwappableAssignmentId === null
                ? "No upcoming shift is eligible for a swap"
                : undefined
            }
            onClick={() => nextSwappableAssignmentId && onRequestSwap(nextSwappableAssignmentId)}
            className={ITEM}
          >
            <Repeat className="size-4" aria-hidden /> Request a shift swap
          </button>
        )}
      </div>
    </section>
  )
}
