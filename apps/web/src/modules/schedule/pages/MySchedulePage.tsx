import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import type { ClockState } from "@/components/hrms/ClockInOutWidget"
import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState"
import { PageHeader } from "@/components/shell/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { type LeaveRequest, leaveApi } from "@/modules/leave/api"

import { ApiError, type AttendanceRecord, attendanceApi } from "@/modules/attendance/api"
import { type Shift, type ShiftAssignment, scheduleApi } from "../api"
import { MySwapRequests } from "../components/MySwapRequests"
import { ScheduleCalendarCard } from "../components/ScheduleCalendarCard"
import { ScheduleHero } from "../components/ScheduleHero"
import { ScheduleKpis } from "../components/ScheduleKpis"
import { SwapRequestDrawer } from "../components/SwapRequestDrawer"
import { QuickActionsCard } from "../components/rail/QuickActionsCard"
import { UpcomingHolidaysCard } from "../components/rail/UpcomingHolidaysCard"
import { UpcomingShiftsCard } from "../components/rail/UpcomingShiftsCard"
import { buildDayModels } from "../lib/day-model"
import { addDaysIso, todayIsoLocal } from "../lib/local-date"
import {
  type ScheduleView,
  monthGridDays,
  rangeFor,
  shiftAnchor,
  startOfWeekIso,
} from "../lib/schedule-range"
import { type SwapRequest, listMySwapRequests } from "../swap-api"

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function attendanceLabel(status: string | null | undefined): string {
  if (!status) return "No record"
  return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

/** Human label for the swap drawer's "Giving up <label>" line — the drawer
 * expects a formatted date (it formats candidate dates the same way), not a
 * raw YYYY-MM-DD key. */
function humanDate(iso: string): string {
  if (!iso) return ""
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export default function MySchedulePage() {
  const { perms } = useAuth()
  const canClock = perms.has("attendance:clock:self")

  const [view, setView] = useState<ScheduleView>("month")
  const [anchor, setAnchor] = useState<string>(() => todayIsoLocal())

  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [todayRec, setTodayRec] = useState<AttendanceRecord | null>(null)

  const [loading, setLoading] = useState(true)
  const [noEmployee, setNoEmployee] = useState(false)
  const [busy, setBusy] = useState(false)
  const [swapFor, setSwapFor] = useState<string | null>(null)
  const [swapVersion, setSwapVersion] = useState(0)

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor])

  const refresh = useCallback(async () => {
    setLoading(true)
    setNoEmployee(false)

    // Required: without these the page has nothing to say.
    try {
      const [a, t] = await Promise.all([
        scheduleApi.myAssignments(range.from, range.to),
        attendanceApi.today(),
      ])
      setAssignments(a)
      setTodayRec(t)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNoEmployee(true)
        setLoading(false)
        return
      }
      toast.error(e instanceof Error ? e.message : "Could not load your schedule.")
    }

    // Decoupled (CLAUDE.md §3.7): each of these degrades on its own without
    // taking the calendar down with it.
    try {
      setShifts(await scheduleApi.listShifts())
    } catch {
      setShifts([])
    }
    try {
      const years = [...new Set([range.from.slice(0, 4), range.to.slice(0, 4)])].map(Number)
      const lists = await Promise.all(years.map((y) => scheduleApi.listHolidays(y).catch(() => [])))
      setHolidays(lists.flat().map((h) => ({ date: h.date, name: h.name })))
    } catch {
      setHolidays([])
    }
    try {
      setLeaves(await leaveApi.listMyRequests())
    } catch {
      setLeaves([])
    }
    try {
      setSwaps(await listMySwapRequests())
    } catch {
      setSwaps([])
    }

    setLoading(false)
  }, [range.from, range.to])

  // biome-ignore lint/correctness/useExhaustiveDependencies: swapVersion is a counter that intentionally re-triggers the fetch
  useEffect(() => {
    refresh()
  }, [refresh, swapVersion])

  async function clock(action: "in" | "out") {
    setBusy(true)
    try {
      await (action === "in" ? attendanceApi.clockIn() : attendanceApi.clockOut())
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Clock-${action} failed.`)
    } finally {
      setBusy(false)
    }
  }

  const todayIso = todayIsoLocal()

  const days = useMemo(() => {
    const dates =
      view === "week"
        ? Array.from({ length: 7 }, (_, i) => addDaysIso(startOfWeekIso(anchor), i))
        : monthGridDays(anchor)
    return buildDayModels({
      dates,
      anchorMonth: anchor.slice(0, 7),
      todayIso,
      assignments,
      shifts,
      holidays,
      leaves,
      swaps,
    })
  }, [view, anchor, todayIso, assignments, shifts, holidays, leaves, swaps])

  // Forward-looking lists are independent of the visible range.
  const upcoming = useMemo(() => days.filter((d) => d.date > todayIso), [days, todayIso])
  const nextSwappable = upcoming.find((d) => d.swapEligibility.canSwap)?.shift?.assignmentId ?? null
  const nextHoliday =
    holidays.filter((h) => h.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date))[0] ??
    null
  const pendingSwaps = swaps.filter((s) => s.status === "pending").length

  const todayModel = days.find((d) => d.isToday) ?? null
  const clockState: ClockState = !todayRec?.clock_in
    ? { status: "off" }
    : todayRec.clock_out
      ? {
          status: "out",
          clockedIn: hhmm(todayRec.clock_in),
          clockedOut: hhmm(todayRec.clock_out),
        }
      : { status: "in", since: todayRec.clock_in }

  if (noEmployee) {
    return (
      <div className="space-y-4">
        <PageHeader breadcrumb="Schedule" title="My Schedule" />
        <NotLinkedEmptyState scope="schedule" />
      </div>
    )
  }

  const swapDay = days.find((d) => d.shift?.assignmentId === swapFor) ?? null

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb="Schedule" title="My Schedule" />

      {loading && assignments.length === 0 ? (
        <Skeleton className="h-36 rounded-2xl" />
      ) : (
        <ScheduleHero
          today={todayModel}
          clockState={clockState}
          statusLabel={attendanceLabel(todayRec?.status)}
          canClock={canClock}
          busy={busy}
          onClockIn={() => clock("in")}
          onClockOut={() => clock("out")}
        />
      )}

      <ScheduleKpis view={view} days={days} nextHoliday={nextHoliday} pendingSwaps={pendingSwaps} />

      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
        <div className="space-y-4">
          <ScheduleCalendarCard
            view={view}
            anchor={anchor}
            days={days}
            loading={loading}
            onViewChange={setView}
            onStep={(direction) => setAnchor(shiftAnchor(view, anchor, direction))}
            onToday={() => setAnchor(todayIsoLocal())}
            onRequestSwap={setSwapFor}
          />

          {swapFor && (
            <SwapRequestDrawer
              assignmentId={swapFor}
              myDateLabel={humanDate(swapDay?.date ?? "")}
              myShiftLabel={swapDay?.shift?.name ?? ""}
              onClose={() => setSwapFor(null)}
              onCreated={() => {
                setSwapFor(null)
                setSwapVersion((v) => v + 1)
              }}
            />
          )}
        </div>

        <div className="space-y-4">
          <UpcomingShiftsCard days={upcoming} onRequestSwap={setSwapFor} />
          <MySwapRequests refreshKey={swapVersion} onChanged={() => setSwapVersion((v) => v + 1)} />
          <UpcomingHolidaysCard holidays={holidays} todayIso={todayIso} />
          <QuickActionsCard nextSwappableAssignmentId={nextSwappable} onRequestSwap={setSwapFor} />
        </div>
      </div>
    </div>
  )
}
