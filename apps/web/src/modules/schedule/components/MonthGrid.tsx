import { cn } from "@/lib/utils"

import type { DayModel } from "../lib/day-model"
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
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="flex items-center gap-1 min-w-0">
            <span
              className={cn("size-2 rounded-full shrink-0", TONE_DOT[day.shift.tone])}
              aria-hidden
            />
            <span className="text-small font-semibold text-text-primary truncate">
              {day.shift.code}
            </span>
            {day.shift.crossesMidnight && (
              <span title="Crosses midnight" className="text-yellow text-small" aria-hidden>
                ↷
              </span>
            )}
          </span>
          {day.shift.timeRange && (
            <span className="font-mono text-[10px] text-text-secondary truncate">
              {day.shift.timeRange}
            </span>
          )}
          {day.leaveTypeCode && (
            <span className="text-[10px] text-lavender font-semibold">{day.leaveTypeCode}</span>
          )}
        </div>
      ) : day.leaveTypeCode ? (
        <span className="text-small text-lavender truncate">On leave · {day.leaveTypeCode}</span>
      ) : day.holidayName ? (
        <span className="text-small text-peach truncate" title={day.holidayName}>
          {day.holidayName}
        </span>
      ) : (
        <span className="text-small text-text-tertiary">Off</span>
      )}

      {day.shift && day.holidayName && (
        <span className="text-[10px] text-peach truncate" title={day.holidayName}>
          {day.holidayName}
        </span>
      )}
    </div>
  )
}
