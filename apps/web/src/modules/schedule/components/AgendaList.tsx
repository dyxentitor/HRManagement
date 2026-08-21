import { CalendarDays } from "lucide-react"
import { useEffect, useRef } from "react"

import { EmptyState } from "@/components/hrms"
import { cn } from "@/lib/utils"

import type { DayModel } from "../lib/day-model"
import { addDaysIso, todayIsoLocal } from "../lib/local-date"
import { startOfWeekIso } from "../lib/schedule-range"
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

function weekHeading(weekStart: string, todayWeekStart: string): string {
  if (weekStart === todayWeekStart) return "This week"
  if (weekStart === addDaysIso(todayWeekStart, 7)) return "Next week"
  return `Week of ${new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })}`
}

/**
 * Linear, scannable view over the same anchored range as Month. Empty days are
 * kept as dim "Off" rows so the rhythm of the month stays readable, and this is
 * the default tab below `sm`.
 */
export function AgendaList({ days, onRequestSwap }: Props) {
  // NOTE: must be useRef<HTMLDivElement>(null), NOT useRef<HTMLDivElement | null>.
  // The `| null` form produces RefObject<HTMLDivElement | null>, which tsc
  // rejects as not assignable to LegacyRef<HTMLDivElement> (TS2322).
  const todayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: "nearest" })
  }, [])

  if (days.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" aria-hidden />}
        title="Nothing scheduled"
        description="No shifts published for this period yet."
      />
    )
  }

  const todayWeekStart = startOfWeekIso(todayIsoLocal())
  const groups: { weekStart: string; days: DayModel[] }[] = []
  for (const d of days) {
    const ws = startOfWeekIso(d.date)
    const last = groups[groups.length - 1]
    if (last && last.weekStart === ws) last.days.push(d)
    else groups.push({ weekStart: ws, days: [d] })
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <div key={g.weekStart}>
          <h3
            data-testid="agenda-week-heading"
            className="text-label uppercase text-text-tertiary mt-4 first:mt-0 mb-1.5"
          >
            {weekHeading(g.weekStart, todayWeekStart)}
          </h3>
          <div className="flex flex-col gap-1.5">
            {g.days.map((d) => (
              <AgendaRow
                key={d.date}
                day={d}
                onRequestSwap={onRequestSwap}
                rowRef={d.isToday ? todayRef : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AgendaRow({
  day,
  onRequestSwap,
  rowRef,
}: {
  day: DayModel
  onRequestSwap: (assignmentId: string) => void
  rowRef?: React.Ref<HTMLDivElement>
}) {
  const dayNum = new Date(`${day.date}T00:00:00Z`).getUTCDate()
  const bare = !day.shift && !day.leaveTypeCode && !day.holidayName

  return (
    <div
      ref={rowRef}
      data-testid="agenda-row"
      data-today={day.isToday}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2 bg-surface-hover",
        day.isToday ? "border-accent-500" : "border-border-subtle",
        bare && "opacity-60",
      )}
    >
      <span
        className={cn(
          "w-1 self-stretch rounded-full shrink-0",
          day.shift ? TONE_DOT[day.shift.tone] : "bg-border-subtle",
        )}
        aria-hidden
      />
      <div className="text-center min-w-[2.5rem]">
        <span className="block text-h3 font-bold leading-none text-text-primary">{dayNum}</span>
        <span className="block text-label uppercase text-text-tertiary">
          {weekdayLabel(day.date, "short")}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {/*
         * Additive, not exclusive: a shift, an approved leave and a public
         * holiday can all land on the same day, in any combination. The
         * holiday name is rendered unconditionally below so it never gets
         * silently dropped by whichever branch below wins (the bug MonthGrid
         * shipped with), and "Off" only appears when nothing else does (the
         * bug WeekStrip shipped with).
         */}
        {day.shift ? (
          <>
            <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="text-body font-semibold text-text-primary truncate">
                {day.shift.name}
              </span>
              {day.leaveTypeCode && (
                <span className="text-small text-lavender">On leave · {day.leaveTypeCode}</span>
              )}
              {day.hasPendingSwap && <span className="text-small text-yellow">Swap pending</span>}
            </span>
            <span className="font-mono text-small text-text-secondary">
              {day.shift.timeRange}
              {day.shift.hours > 0 && ` · ${day.shift.hours}h`}
              {day.shift.endsOn && ` · ends ${shortDay(day.shift.endsOn)}`}
            </span>
            {day.shift.coveringForName && (
              <span className="block text-small text-coral truncate">
                ⤴ Covering {day.shift.coveringForName}
              </span>
            )}
          </>
        ) : day.leaveTypeCode ? (
          <span className="text-body text-lavender">On leave · {day.leaveTypeCode}</span>
        ) : !day.holidayName ? (
          <span className="text-body text-text-tertiary">Off</span>
        ) : null}

        {day.holidayName && (
          <span className="block text-small text-peach truncate">{day.holidayName}</span>
        )}
      </div>

      {day.shift && <ShiftActionsMenu day={day} onRequestSwap={onRequestSwap} />}
    </div>
  )
}
