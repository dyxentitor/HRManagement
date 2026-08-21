import { KpiTile } from "@/components/hrms"

import type { DayModel } from "../lib/day-model"
import type { ScheduleView } from "../lib/schedule-range"

interface Props {
  view: ScheduleView
  days: DayModel[]
  nextHoliday: { date: string; name: string } | null
  pendingSwaps: number
}

/**
 * Range-scoped counters. Labels follow the active tab so "5" is never
 * ambiguous between a week and a month. Pending swaps is deliberately global —
 * it is about the employee's requests, not the visible dates.
 */
export function ScheduleKpis({ view, days, nextHoliday, pendingSwaps }: Props) {
  // In month/agenda view the fetched range includes leading and trailing days
  // from adjacent months; those must not inflate the month's totals.
  const scoped = view === "week" ? days : days.filter((d) => d.inAnchorMonth)

  const shifts = scoped.filter((d) => d.shift).length
  const hours = Math.round(scoped.reduce((sum, d) => sum + (d.shift?.hours ?? 0), 0))
  const daysOff = scoped.filter((d) => !d.shift && !d.leaveTypeCode).length
  const period = view === "week" ? "week" : "month"

  const holidayValue = nextHoliday
    ? new Date(`${nextHoliday.date}T00:00:00Z`).toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "—"

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div data-testid="kpi-shifts">
        <KpiTile tone="sky" label={`Shifts this ${period}`} value={shifts} icon={shifts} />
      </div>
      <div data-testid="kpi-hours">
        <KpiTile tone="lavender" label="Hours" value={`${hours}h`} icon="h" />
      </div>
      <div data-testid="kpi-daysoff">
        <KpiTile tone="mint" label="Days off" value={daysOff} icon={daysOff} />
      </div>
      <div data-testid="kpi-holiday">
        <KpiTile
          tone="peach"
          label="Next holiday"
          value={holidayValue}
          delta={nextHoliday?.name}
          icon="H"
        />
      </div>
      <div data-testid="kpi-swaps">
        <KpiTile tone="yellow" label="Pending swaps" value={pendingSwaps} icon={pendingSwaps} />
      </div>
    </div>
  )
}
