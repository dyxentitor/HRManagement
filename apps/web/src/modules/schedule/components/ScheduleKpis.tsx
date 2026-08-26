import { CalendarCheck, Clock, Coffee, Repeat } from "lucide-react"

import { KpiTile } from "@/components/hrms"

import type { DayModel } from "../lib/day-model"
import { type ScheduleView, rangeLabel } from "../lib/schedule-range"

interface Props {
  view: ScheduleView
  anchor: string
  days: DayModel[]
  pendingSwaps: number
}

/**
 * Four range-scoped counters. Labels and supporting text both follow the active
 * tab, so "8" is never ambiguous between a week and a month.
 *
 * There is deliberately no "Next holiday" tile — the Upcoming Holidays panel in
 * the rail already carries that, with more room and the following few dates
 * rather than just one.
 *
 * Pending requests stays global on purpose: it is about the employee's own
 * requests, not the dates currently on screen, so its supporting text says so
 * instead of naming the range.
 */
export function ScheduleKpis({ view, anchor, days, pendingSwaps }: Props) {
  // In month/agenda view the fetched range includes leading and trailing days
  // from adjacent months; those must not inflate the month's totals.
  const scoped = view === "week" ? days : days.filter((d) => d.inAnchorMonth)

  const shifts = scoped.filter((d) => d.shift).length
  const hours = Math.round(scoped.reduce((sum, d) => sum + (d.shift?.hours ?? 0), 0))
  const daysOff = scoped.filter((d) => !d.shift && !d.leaveTypeCode).length
  const period = view === "week" ? "week" : "month"
  // "August 2026" / "18-24 Aug 2026" — the same string the calendar header
  // shows, so the tiles and the grid can never disagree about the range.
  const rangeText = rangeLabel(view, anchor)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div data-testid="kpi-shifts">
        <KpiTile
          tone="sky"
          label={`Shifts this ${period}`}
          value={shifts}
          support={rangeText}
          icon={<CalendarCheck aria-hidden />}
        />
      </div>
      <div data-testid="kpi-hours">
        <KpiTile
          tone="lavender"
          label={`Hours this ${period}`}
          value={`${hours}h`}
          support={rangeText}
          icon={<Clock aria-hidden />}
        />
      </div>
      <div data-testid="kpi-daysoff">
        <KpiTile
          tone="mint"
          label="Days off"
          value={daysOff}
          support={rangeText}
          icon={<Coffee aria-hidden />}
        />
      </div>
      <div data-testid="kpi-swaps">
        <KpiTile
          tone="yellow"
          label="Pending requests"
          value={pendingSwaps}
          support={pendingSwaps === 0 ? "No action required" : "Awaiting a decision"}
          icon={<Repeat aria-hidden />}
        />
      </div>
    </div>
  )
}
