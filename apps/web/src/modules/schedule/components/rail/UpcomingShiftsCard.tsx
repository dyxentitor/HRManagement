import { cn } from "@/lib/utils"

import type { DayModel } from "../../lib/day-model"
import { TONE_DOT } from "../../lib/shift-tone"
import { weekdayLabel } from "../../lib/weekday"
import { ShiftActionsMenu } from "../ShiftActionsMenu"

interface Props {
  days: DayModel[]
  onRequestSwap: (assignmentId: string) => void
}

/** Rail card — the next five days that actually carry a shift. */
export function UpcomingShiftsCard({ days, onRequestSwap }: Props) {
  // Narrow into a tuple of (day, shift) so the JSX below never needs a
  // non-null assertion — biome `lint/style/noNonNullAssertion` is an error.
  const rows = days.flatMap((d) => (d.shift ? [{ day: d, shift: d.shift }] : [])).slice(0, 5)

  return (
    <section className="glass-surface rounded-2xl p-4">
      <h2 className="text-label uppercase text-text-tertiary mb-2">Next 5 shifts</h2>
      {rows.length === 0 ? (
        <p className="text-small text-text-tertiary">No upcoming shifts in this range.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map(({ day, shift }) => (
            <li
              key={day.date}
              data-testid="upcoming-shift-row"
              className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0"
            >
              <span className="text-center min-w-9 rounded-lg bg-surface-hover px-1.5 py-1">
                <span className="block text-body font-bold leading-none text-text-primary">
                  {new Date(`${day.date}T00:00:00Z`).getUTCDate()}
                </span>
                <span className="block text-label uppercase text-text-tertiary">
                  {weekdayLabel(day.date, "short")}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={cn("size-2 rounded-full shrink-0", TONE_DOT[shift.tone])}
                    aria-hidden
                  />
                  <span className="text-small font-semibold text-text-primary truncate">
                    {shift.name}
                  </span>
                </span>
                <span className="font-mono text-small text-text-secondary">{shift.timeRange}</span>
              </span>
              <ShiftActionsMenu day={day} onRequestSwap={onRequestSwap} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
