import { ChevronLeft, ChevronRight } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { DayModel } from "../lib/day-model"
import { type ScheduleView, rangeLabel } from "../lib/schedule-range"
import { AgendaList } from "./AgendaList"
import { MonthGrid } from "./MonthGrid"
import { WeekStrip } from "./WeekStrip"

interface Props {
  view: ScheduleView
  anchor: string
  days: DayModel[]
  loading: boolean
  onViewChange: (view: ScheduleView) => void
  onStep: (direction: -1 | 1) => void
  onToday: () => void
  onRequestSwap: (assignmentId: string) => void
}

/** Tab + range-nav shell. Holds no data of its own. */
export function ScheduleCalendarCard({
  view,
  anchor,
  days,
  loading,
  onViewChange,
  onStep,
  onToday,
  onRequestSwap,
}: Props) {
  return (
    <section className="glass-surface rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v) => onViewChange(v as ScheduleView)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="agenda">Agenda</TabsTrigger>
            </TabsList>
          </Tabs>
          <h2 className="text-h3 text-text-primary">{rangeLabel(view, anchor)}</h2>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={view === "week" ? "Previous week" : "Previous month"}
            onClick={() => onStep(-1)}
            className="rounded-lg border border-border-subtle px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="rounded-lg border border-border-subtle px-2.5 py-1 text-small text-text-secondary hover:text-text-primary hover:bg-surface-hover"
          >
            Today
          </button>
          <button
            type="button"
            aria-label={view === "week" ? "Next week" : "Next month"}
            onClick={() => onStep(1)}
            className="rounded-lg border border-border-subtle px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {loading ? (
        <div data-testid="calendar-skeleton" className="space-y-1.5">
          <Skeleton className="h-6 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : view === "month" ? (
        <MonthGrid days={days} onRequestSwap={onRequestSwap} />
      ) : view === "week" ? (
        <WeekStrip days={days} onRequestSwap={onRequestSwap} />
      ) : (
        <AgendaList days={days} onRequestSwap={onRequestSwap} />
      )}
    </section>
  )
}
