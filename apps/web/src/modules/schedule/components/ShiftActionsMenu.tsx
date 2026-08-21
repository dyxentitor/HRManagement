import { CalendarPlus, Copy, MoreHorizontal, Repeat } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth"

import type { DayModel } from "../lib/day-model"

interface Props {
  day: DayModel
  onRequestSwap: (assignmentId: string) => void
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Per-shift action menu. Replaces the always-visible "REQUEST SWAP" text that
 * used to sit on every eligible day card.
 *
 * Ineligible swaps are shown DISABLED WITH THE REASON rather than hidden — the
 * old behaviour made "not allowed" indistinguishable from "not loaded".
 * This gate is UX only; the server re-validates every rule at submit.
 */
export function ShiftActionsMenu({ day, onRequestSwap }: Props) {
  const { perms } = useAuth()
  const canSwap = perms.has("schedule:swap:request:self")
  const canApplyLeave = perms.has("leave:request:create:self")

  if (!day.shift) return null
  const { shift } = day
  const dateLabel = longDate(day.date)

  async function copyDetails() {
    const text = `${dateLabel} · ${shift.name}${shift.timeRange ? ` · ${shift.timeRange}` : ""}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Shift details copied.")
    } catch {
      toast.error("Could not copy to the clipboard.")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${dateLabel}, ${shift.name}`}
          className="text-text-tertiary hover:text-text-primary rounded p-0.5"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-label uppercase text-text-tertiary">
          {dateLabel} · {shift.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {canSwap && (
          <DropdownMenuItem
            disabled={!day.swapEligibility.canSwap}
            onSelect={() => onRequestSwap(shift.assignmentId)}
            className="flex-col items-start gap-0.5"
          >
            <span className="flex items-center gap-2">
              <Repeat className="size-4" aria-hidden /> Request a shift swap
            </span>
            {day.swapEligibility.reason && (
              <span className="text-small text-text-tertiary pl-6">
                {day.swapEligibility.reason}
              </span>
            )}
          </DropdownMenuItem>
        )}

        {canApplyLeave && (
          <DropdownMenuItem asChild>
            <Link to={`/leave/apply?start=${day.date}`} className="flex items-center gap-2">
              <CalendarPlus className="size-4" aria-hidden /> Apply for leave this day
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={copyDetails} className="flex items-center gap-2">
          <Copy className="size-4" aria-hidden /> Copy shift details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
