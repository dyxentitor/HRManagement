import { StatusPill } from "@/components/hrms"
import { cn } from "@/lib/utils"

import type { DayModel } from "../lib/day-model"
import { TONE_DOT } from "../lib/shift-tone"
import { weekdayLabel } from "../lib/weekday"
import { ShiftActionsMenu } from "./ShiftActionsMenu"

interface Props {
  days: DayModel[]
  onRequestSwap: (assignmentId: string) => void
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${weekdayLabel(iso, "short")} ${d.getUTCDate()}`
}

/**
 * Detailed week. Seven columns so days stay comparable, each ~3x a month
 * cell's height so it can carry the shift name, time range, hours and up to
 * five state tags.
 *
 * Overnight and Cover are new to employees — `crosses_midnight` and
 * `covering_for` already ship in the API payload but were never surfaced here.
 *
 * States are additive, not exclusive: a day can carry a shift, a leave tag
 * and a holiday name all at once. See the overlay branches below — none of
 * them are mutually exclusive with each other (the MonthGrid ternary-chain
 * bug this guards against).
 */
export function WeekStrip({ days, onRequestSwap }: Props) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1.5">
        {days.map((d) => (
          <WeekCell key={d.date} day={d} onRequestSwap={onRequestSwap} />
        ))}
      </div>
      <div
        data-testid="week-legend"
        className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border-subtle text-small text-text-tertiary"
      >
        <span>Holiday — public holiday</span>
        <span>Leave — approved leave</span>
        <span>Overnight — crosses midnight</span>
        <span>Cover — covering a teammate</span>
      </div>
    </div>
  )
}

function WeekCell({
  day,
  onRequestSwap,
}: {
  day: DayModel
  onRequestSwap: (assignmentId: string) => void
}) {
  const dayNum = new Date(`${day.date}T00:00:00Z`).getUTCDate()

  return (
    <div
      data-testid="week-cell"
      data-today={day.isToday}
      className={cn(
        "rounded-xl border p-2.5 min-h-[8.5rem] flex flex-col gap-1.5 bg-surface-hover",
        day.isToday
          ? "border-accent-500 ring-1 ring-accent-500/40"
          : day.holidayName
            ? "border-peach/35"
            : "border-border-subtle",
        day.isWeekend && !day.isToday && !day.holidayName && "bg-surface-elevated",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-label uppercase text-text-tertiary">
          {weekdayLabel(day.date, "short")}
        </span>
        {day.isToday && (
          <span className="text-label uppercase font-semibold text-accent-200 bg-accent-500/15 px-1.5 rounded">
            Today
          </span>
        )}
      </div>

      <span
        className={cn(
          "text-h2 leading-none font-bold",
          day.holidayName ? "text-peach" : "text-text-primary",
          day.isToday && "text-accent-200",
        )}
      >
        {dayNum}
      </span>

      <div className="flex flex-wrap gap-1">
        {day.holidayName && <StatusPill tone="peach" label="Holiday" />}
        {day.leaveTypeCode && <StatusPill tone="lavender" label="Leave" />}
        {day.shift?.crossesMidnight && <StatusPill tone="yellow" label="Overnight" />}
        {day.shift?.coveringForName && <StatusPill tone="coral" label="Cover" />}
        {day.hasPendingSwap && <StatusPill tone="yellow" label="Swap pending" />}
      </div>

      {/*
       * Additive, not exclusive: a shift, an approved leave and a public
       * holiday can all land on the same day, in any combination. Each
       * branch below renders independently of the others so none of them
       * ever silently swallows another (the bug MonthGrid shipped with).
       */}
      {day.shift ? (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn("size-2.5 rounded-full shrink-0", TONE_DOT[day.shift.tone])}
              aria-hidden
            />
            <span className="text-body font-semibold text-text-primary truncate">
              {day.shift.name}
            </span>
          </span>
          {day.shift.timeRange && (
            <span className="font-mono text-small text-text-secondary">{day.shift.timeRange}</span>
          )}
          {day.shift.hours > 0 && (
            <span className="text-small text-text-tertiary">{day.shift.hours}h</span>
          )}
          {day.shift.endsOn && (
            <span className="text-small text-yellow truncate">
              ↷ ends {shortDay(day.shift.endsOn)}
            </span>
          )}
          {day.shift.coveringForName && (
            <span className="text-small text-coral truncate">
              ⤴ Covering {day.shift.coveringForName}
            </span>
          )}
        </div>
      ) : day.leaveTypeCode ? (
        <span className="text-body text-lavender">On leave · {day.leaveTypeCode}</span>
      ) : !day.holidayName ? (
        <span className="text-body text-text-tertiary">Off</span>
      ) : null}

      {day.holidayName && (
        <span className="text-small text-peach truncate" title={day.holidayName}>
          {day.holidayName}
        </span>
      )}

      {day.shift && (
        <div className="mt-auto pt-1">
          <ShiftActionsMenu day={day} onRequestSwap={onRequestSwap} />
        </div>
      )}
    </div>
  )
}
