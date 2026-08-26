import { cn } from "@/lib/utils"

import type { DayModel } from "../lib/day-model"
import { semanticLabel } from "../lib/shift-semantic"
import { TONE_DOT } from "../lib/shift-tone"
import { ShiftActionsMenu } from "./ShiftActionsMenu"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface Props {
  days: DayModel[]
  onRequestSwap: (assignmentId: string) => void
}

/**
 * Compact month calendar. Cells stay small on purpose — the bar to clear is
 * "understand most of the month without clicking every date", which shift code
 * + time range meets. Full detail lives in the Week tab.
 */
export function MonthGrid({ days, onRequestSwap }: Props) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            data-testid="weekday-header"
            className="text-label uppercase text-text-tertiary text-center"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <MonthCell key={d.date} day={d} onRequestSwap={onRequestSwap} />
        ))}
      </div>

      {/* Month cells are too narrow to spell every state out, so the symbols
       * they do use are defined here rather than left to be guessed. */}
      <div
        data-testid="month-legend"
        className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border-subtle text-small text-text-tertiary"
      >
        <span>DAY / NIGHT / EVE — shift type</span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-yellow" aria-hidden /> Swap pending
        </span>
        <span>↷ Crosses midnight</span>
        <span className="text-lavender">Leave code — approved leave</span>
        <span className="text-peach">Coloured date — public holiday</span>
      </div>
    </div>
  )
}

function MonthCell({
  day,
  onRequestSwap,
}: {
  day: DayModel
  onRequestSwap: (assignmentId: string) => void
}) {
  const dayNum = new Date(`${day.date}T00:00:00Z`).getUTCDate()

  return (
    <div
      data-testid="month-cell"
      data-today={day.isToday}
      data-outside={!day.inAnchorMonth}
      className={cn(
        "rounded-lg border p-1.5 min-h-[4.5rem] flex flex-col gap-1 bg-surface-hover",
        day.isToday ? "border-accent-500 ring-1 ring-accent-500/40" : "border-border-subtle",
        day.isWeekend && !day.isToday && "bg-surface-elevated",
        !day.inAnchorMonth && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "text-small font-semibold",
            day.holidayName ? "text-peach" : "text-text-tertiary",
            day.isToday && "text-accent-200",
          )}
        >
          {dayNum}
        </span>
        <div className="flex items-center gap-1">
          {day.hasPendingSwap && (
            <span title="Swap pending" className="size-1.5 rounded-full bg-yellow" aria-hidden />
          )}
          {day.shift && <ShiftActionsMenu day={day} onRequestSwap={onRequestSwap} />}
        </div>
      </div>

      {day.shift ? (
        // The block carries the unabbreviated detail, so whatever the narrow
        // cell truncates stays reachable on hover — and the ⋯ menu repeats it
        // for keyboard and touch users.
        <div className="flex flex-col gap-0.5 min-w-0" title={shiftTitle(day)}>
          <span className="flex items-center gap-1 min-w-0">
            <span
              className={cn("size-2 rounded-full shrink-0", TONE_DOT[day.shift.tone])}
              aria-hidden
            />
            <span className="text-small font-semibold text-text-primary truncate">
              {/* DAY / NIGHT, not D / N — a bare letter means nothing without
               * the legend, and the cell has room for the word. */}
              {semanticLabel(day.shift.code, day.shift.name)}
            </span>
            {day.shift.crossesMidnight && (
              <span title="Crosses midnight" className="text-yellow text-small" aria-hidden>
                ↷
              </span>
            )}
          </span>
          {day.shift.timeRange && (
            <span className="font-mono text-small text-text-secondary truncate">
              {day.shift.timeRange}
            </span>
          )}
          {day.leaveTypeCode && (
            <span className="text-small text-lavender font-semibold truncate">
              {day.leaveTypeCode}
            </span>
          )}
        </div>
      ) : day.leaveTypeCode ? (
        <span className="text-small text-lavender truncate">On leave · {day.leaveTypeCode}</span>
      ) : day.holidayName ? (
        <HolidayLine name={day.holidayName} />
      ) : (
        <span className="text-small text-text-tertiary">Off</span>
      )}

      {/*
       * Additive, not exclusive: a shift or an approved leave can land on a
       * public holiday. The branch above already shows the holiday when it's
       * the ONLY thing on the day — this covers every other combination so
       * the holiday name is never silently dropped.
       */}
      {day.holidayName && (day.shift || day.leaveTypeCode) && (
        <HolidayLine name={day.holidayName} />
      )}
    </div>
  )
}

/** Everything the cell knows about the day, for the hover/focus tooltip. */
function shiftTitle(day: DayModel): string {
  if (!day.shift) return ""
  const parts = [day.shift.name]
  if (day.shift.timeRange) parts.push(day.shift.timeRange)
  if (day.shift.hours > 0) parts.push(`${day.shift.hours}h`)
  if (day.shift.crossesMidnight) parts.push("crosses midnight")
  if (day.shift.coveringForName) parts.push(`covering ${day.shift.coveringForName}`)
  if (day.leaveTypeCode) parts.push(`on leave · ${day.leaveTypeCode}`)
  if (day.holidayName) parts.push(day.holidayName)
  return parts.join(" · ")
}

function HolidayLine({ name }: { name: string }) {
  return (
    <span className="text-small text-peach truncate" title={name}>
      {name}
    </span>
  )
}
