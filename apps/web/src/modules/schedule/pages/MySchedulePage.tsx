import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { SwapRequestDrawer, type SwapSourceShift } from "../components/SwapRequestDrawer"
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

/** The attendance classification, or null when there is no record yet — the
 * hero renders the clock status itself, so "No record" would only restate it. */
function attendanceLabel(status: string | null | undefined): string | null {
  if (!status) return null
  return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

/** How far ahead of today the hero / rail cards look, independent of the
 * calendar's own view/anchor. Forward-looking widgets must survive
 * navigation — see the horizon-fetch block in `refreshHorizon` below. */
const HORIZON_DAYS = 45

/**
 * Spec §11: Agenda is the *default* tab below `sm` (640px), not a lock — the
 * user can still switch to Month or Week. Read once at mount via
 * `useState(initializer)`, matching the design's "default", not "controlled
 * by a live resize listener" — a resize mid-session shouldn't yank the user
 * off a tab they picked on purpose.
 */
function initialView(): ScheduleView {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "month"
  return window.matchMedia("(max-width: 639px)").matches ? "agenda" : "month"
}

/** Stable keys for the 4 KPI skeleton tiles — index-as-key would be fine
 * here too (the list never reorders), but named keys read better in the DOM.
 * Must stay in step with the tiles ScheduleKpis renders. */
const KPI_SKELETON_KEYS = ["shifts", "hours", "daysoff", "swaps"] as const

export default function MySchedulePage() {
  const { perms } = useAuth()
  const canClock = perms.has("attendance:clock:self")

  const [view, setView] = useState<ScheduleView>(initialView)
  const [anchor, setAnchor] = useState<string>(() => todayIsoLocal())

  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [horizonAssignments, setHorizonAssignments] = useState<ShiftAssignment[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [todayRec, setTodayRec] = useState<AttendanceRecord | null>(null)

  const [loading, setLoading] = useState(true)
  const [horizonLoading, setHorizonLoading] = useState(true)
  // True only until BOTH fetches have completed once. Deliberately distinct
  // from `loading`/`horizonLoading` themselves, which flip true again on
  // every subsequent nav/mutation — the KPI row and rail must show a
  // skeleton on first paint (spec §12, §2.2) but must never re-blank on a
  // "Next month" click once real data exists (see refreshHorizon's comment).
  const [firstLoadDone, setFirstLoadDone] = useState(false)
  const [noEmployee, setNoEmployee] = useState(false)
  const [busy, setBusy] = useState(false)
  const [swapFor, setSwapFor] = useState<string | null>(null)
  const [swapVersion, setSwapVersion] = useState(0)

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor])

  // Monotonic guard against out-of-order responses: `refresh` does
  // sequential/parallel awaits with no abort controller, so two rapid `›`
  // clicks can have their responses land in either order. Each call to
  // `refresh` claims the next sequence number; every setter below checks it
  // still owns the latest one before writing, so a slow, now-superseded
  // response can never overwrite what a newer one already committed.
  const requestSeqRef = useRef(0)

  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current
    const current = () => seq === requestSeqRef.current

    setLoading(true)
    setNoEmployee(false)

    // Required: without these the page has nothing to say.
    try {
      const [a, t] = await Promise.all([
        scheduleApi.myAssignments(range.from, range.to),
        attendanceApi.today(),
      ])
      if (!current()) return
      setAssignments(a)
      setTodayRec(t)
    } catch (e) {
      if (!current()) return
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
      const s = await scheduleApi.listShifts()
      if (current()) setShifts(s)
    } catch {
      if (current()) setShifts([])
    }
    try {
      // Always union the current year and next year on top of the visible
      // range's years — the rail's "Upcoming holidays" panel is today-anchored
      // (§ refreshHorizon below), so late in December, navigating the
      // *calendar* back to October must not drop next year's holidays out
      // from under it.
      const currentYear = Number(todayIsoLocal().slice(0, 4))
      const years = [
        ...new Set([
          range.from.slice(0, 4),
          range.to.slice(0, 4),
          String(currentYear),
          String(currentYear + 1),
        ]),
      ].map(Number)
      const lists = await Promise.all(years.map((y) => scheduleApi.listHolidays(y).catch(() => [])))
      if (current()) setHolidays(lists.flat().map((h) => ({ date: h.date, name: h.name })))
    } catch {
      if (current()) setHolidays([])
    }
    try {
      const l = await leaveApi.listMyRequests()
      if (current()) setLeaves(l)
    } catch {
      if (current()) setLeaves([])
    }
    try {
      const sw = await listMySwapRequests()
      if (current()) setSwaps(sw)
    } catch {
      if (current()) setSwaps([])
    }

    if (current()) setLoading(false)
  }, [range.from, range.to])

  // biome-ignore lint/correctness/useExhaustiveDependencies: swapVersion is a counter that intentionally re-triggers the fetch
  useEffect(() => {
    refresh()
  }, [refresh, swapVersion])

  // Decoupled from `range`/`view`/`anchor` on purpose: the hero and rail cards
  // are forward-looking widgets anchored on *today*, not on whatever period
  // the calendar happens to be showing (CLAUDE.md §3.7 — this is its own
  // failure-isolated fetch, not folded into `refresh` above, precisely so it
  // never re-runs — and never blanks — on a "Next month" click). Both bounds
  // are computed fresh inside the callback from pure functions, so there is
  // no stale-closure risk in keeping this effect mount-only.
  const refreshHorizon = useCallback(async () => {
    setHorizonLoading(true)
    try {
      const from = todayIsoLocal()
      const to = addDaysIso(from, HORIZON_DAYS)
      setHorizonAssignments(await scheduleApi.myAssignments(from, to))
    } catch {
      setHorizonAssignments([])
    } finally {
      setHorizonLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshHorizon()
  }, [refreshHorizon])

  useEffect(() => {
    if (!loading && !horizonLoading) setFirstLoadDone(true)
  }, [loading, horizonLoading])

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

  // Forward-looking widgets (hero, "next 5 shifts", quick-action swap) are
  // built from their own today-anchored model, not from `days` — `days` is
  // scoped to whatever the calendar happens to be showing (§ScheduleKpis
  // stays range-scoped on purpose), but these must survive navigation.
  const horizonDays = useMemo(() => {
    const to = addDaysIso(todayIso, HORIZON_DAYS)
    const dates: string[] = []
    for (let d = todayIso; d <= to; d = addDaysIso(d, 1)) dates.push(d)
    return buildDayModels({
      dates,
      anchorMonth: todayIso.slice(0, 7),
      todayIso,
      assignments: horizonAssignments,
      shifts,
      holidays,
      leaves,
      swaps,
    })
  }, [todayIso, horizonAssignments, shifts, holidays, leaves, swaps])

  const upcoming = useMemo(
    () => horizonDays.filter((d) => d.date > todayIso),
    [horizonDays, todayIso],
  )
  const nextSwappable = upcoming.find((d) => d.swapEligibility.canSwap)?.shift?.assignmentId ?? null
  const pendingSwaps = swaps.filter((s) => s.status === "pending").length

  /**
   * The employee's own swappable shifts, offered as the drawer's step 1.
   *
   * Unions both day models on purpose: a swap can be launched from the
   * range-scoped calendar (`days` — which may sit months away from today) or
   * from the today-anchored rail cards (`horizonDays`). Taking only one would
   * leave the source unresolvable for requests started from the other.
   * Eligibility mirrors the server's rules via `swapEligibility`.
   */
  const swapSources = useMemo(() => {
    const byId = new Map<string, SwapSourceShift>()
    for (const d of [...horizonDays, ...days]) {
      if (!d.shift || !d.swapEligibility.canSwap || byId.has(d.shift.assignmentId)) continue
      byId.set(d.shift.assignmentId, {
        assignmentId: d.shift.assignmentId,
        date: d.date,
        shiftName: d.shift.name,
        shiftCode: d.shift.code,
        timeRange: d.shift.timeRange,
        hours: d.shift.hours,
      })
    }
    return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [horizonDays, days])

  // The hero must never contradict the calendar. `horizonDays` is its own
  // independently-failing fetch (`refreshHorizon` swallows every error into
  // an empty `horizonAssignments`) — if it blips while the range fetch
  // (`days`) succeeded, prefer whichever model actually has today's shift so
  // the hero and the grid never disagree about the same day. Only fall back
  // to a shift-less horizon/null model when neither source has one.
  const todayFromHorizon = horizonDays.find((d) => d.isToday) ?? null
  const todayFromRange = days.find((d) => d.isToday) ?? null
  const todayModel = todayFromHorizon?.shift
    ? todayFromHorizon
    : (todayFromRange ?? todayFromHorizon)
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

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb="Schedule" title="My Schedule" />

      {loading ? (
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

      {firstLoadDone ? (
        <ScheduleKpis view={view} anchor={anchor} days={days} pendingSwaps={pendingSwaps} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {KPI_SKELETON_KEYS.map((k) => (
            <Skeleton key={k} className="h-[84px] rounded-lg" />
          ))}
        </div>
      )}

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
        </div>

        {firstLoadDone ? (
          // 1-col by default, 2-col at `md` (spec §11: rail stacks below the
          // main panel there), back to 1-col at `lg` once it returns to being
          // the narrow side column. `order-*` reshuffles the mobile (<sm)
          // stack to swap requests → next shifts → holidays → quick actions
          // (spec §11) without duplicating any card in the DOM.
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
            <div className="order-2 sm:order-1">
              <UpcomingShiftsCard days={upcoming} onRequestSwap={setSwapFor} />
            </div>
            <div className="order-1 sm:order-2">
              <MySwapRequests
                refreshKey={swapVersion}
                onChanged={() => setSwapVersion((v) => v + 1)}
              />
            </div>
            <div className="order-3">
              <UpcomingHolidaysCard holidays={holidays} todayIso={todayIso} />
            </div>
            <div className="order-4">
              <QuickActionsCard
                nextSwappableAssignmentId={nextSwappable}
                onRequestSwap={setSwapFor}
              />
            </div>
          </div>
        ) : (
          <Skeleton className="h-72 rounded-2xl" />
        )}
      </div>

      {/*
       * Rendered at page level, in a portal, rather than inside the calendar
       * column — an overlay must not participate in the page's layout. The old
       * inline card grew the page and pushed the rail down every time someone
       * opened it.
       */}
      <SwapRequestDrawer
        open={swapFor !== null}
        assignmentId={swapFor}
        sources={swapSources}
        shifts={shifts}
        onClose={() => setSwapFor(null)}
        onCreated={() => {
          setSwapFor(null)
          setSwapVersion((v) => v + 1)
          toast.success("Swap request sent to your manager.")
        }}
      />
    </div>
  )
}
