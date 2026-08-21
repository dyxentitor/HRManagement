/**
 * Merges the five schedule data sources into one `DayModel` per date.
 *
 * Month, Week and Agenda all render from this array, so any rule expressed
 * here is expressed identically in all three views.
 *
 * Swap-eligibility reasons are copied from the server's own rules in
 * `apps/api/modules/schedule/services/swap.py::validate_pair`. The UI gate is
 * UX only — the server re-validates at submit — but the wording must agree so
 * we never promise a rule the backend does not enforce.
 */

import type { LeaveRequest } from "@/modules/leave/api"

import type { Shift, ShiftAssignment } from "../api"
import type { SwapRequest } from "../swap-api"
import type { Tone } from "./cell-tone"
import { addDaysIso } from "./local-date"
import { formatTimeRange, shiftHours } from "./shift-hours"
import { shiftCodeTone } from "./shift-tone"
import { isWeekendIso } from "./weekday"

export interface DayShiftModel {
  assignmentId: string
  name: string
  code: string
  tone: Tone
  /** "" when the shift catalogue failed to load (decoupled fetch, §3.7). */
  timeRange: string
  hours: number
  crossesMidnight: boolean
  /** YYYY-MM-DD the shift ends on when it crosses midnight, else null. */
  endsOn: string | null
  coveringForName: string | null
}

export interface SwapEligibility {
  canSwap: boolean
  /** null when there is nothing to swap at all (no shift on this day). */
  reason: string | null
}

export interface DayModel {
  date: string
  isToday: boolean
  isWeekend: boolean
  inAnchorMonth: boolean
  holidayName: string | null
  leaveTypeCode: string | null
  shift: DayShiftModel | null
  hasPendingSwap: boolean
  swapEligibility: SwapEligibility
}

/** Only the swap fields this module reads — keeps the test fixtures small. */
type SwapLike = Pick<SwapRequest, "status"> & {
  requester_assignment: { id: string }
  counterparty_assignment: { id: string }
}

export interface BuildDayModelsInput {
  dates: string[]
  /** "YYYY-MM" — dates outside it render dimmed in the month grid. */
  anchorMonth: string
  todayIso: string
  assignments: ShiftAssignment[]
  shifts: Shift[]
  holidays: { date: string; name: string }[]
  leaves: LeaveRequest[]
  swaps: SwapLike[]
}

export function buildDayModels(input: BuildDayModelsInput): DayModel[] {
  const { dates, anchorMonth, todayIso } = input

  const shiftById = new Map(input.shifts.map((s) => [s.id, s] as const))
  const assignmentByDate = new Map(input.assignments.map((a) => [a.work_date, a] as const))
  const holidayByDate = new Map(input.holidays.map((h) => [h.date, h.name] as const))

  const pendingAssignmentIds = new Set<string>()
  for (const s of input.swaps) {
    if (s.status !== "pending") continue
    pendingAssignmentIds.add(s.requester_assignment.id)
    pendingAssignmentIds.add(s.counterparty_assignment.id)
  }

  const approvedLeaves = input.leaves.filter((l) => l.status === "approved")

  return dates.map((date) => {
    const a = assignmentByDate.get(date)
    const shift = a ? buildShift(a, shiftById) : null
    const hasPendingSwap = a ? pendingAssignmentIds.has(a.id) : false

    return {
      date,
      isToday: date === todayIso,
      isWeekend: isWeekendIso(date),
      inAnchorMonth: date.slice(0, 7) === anchorMonth,
      holidayName: holidayByDate.get(date) ?? null,
      leaveTypeCode:
        approvedLeaves.find((l) => l.start_date <= date && date <= l.end_date)?.leave_type_code ??
        null,
      shift,
      hasPendingSwap,
      swapEligibility: resolveSwapEligibility({ assignment: a, date, todayIso, hasPendingSwap }),
    }
  })
}

function buildShift(a: ShiftAssignment, shiftById: Map<string, Shift>): DayShiftModel {
  const sh = shiftById.get(a.shift)
  const crossesMidnight = sh?.crosses_midnight ?? false
  return {
    assignmentId: a.id,
    name: a.shift_name,
    code: a.shift_code,
    tone: shiftCodeTone(a.shift_code),
    timeRange: sh ? formatTimeRange(sh.start_time, sh.end_time) : "",
    hours: sh ? shiftHours(sh.start_time, sh.end_time, sh.crosses_midnight) : 0,
    crossesMidnight,
    endsOn: crossesMidnight ? addDaysIso(a.work_date, 1) : null,
    coveringForName: a.covering_for_name,
  }
}

function resolveSwapEligibility({
  assignment,
  date,
  todayIso,
  hasPendingSwap,
}: {
  assignment: ShiftAssignment | undefined
  date: string
  todayIso: string
  hasPendingSwap: boolean
}): SwapEligibility {
  // Nothing to swap — the menu omits the item entirely rather than
  // explaining why a non-existent shift can't be traded.
  if (!assignment) return { canSwap: false, reason: null }

  if (date <= todayIso) {
    return { canSwap: false, reason: "Only future shifts can be swapped." }
  }
  if (!assignment.is_published) {
    return { canSwap: false, reason: "Only published shifts can be swapped." }
  }
  if (assignment.status !== "scheduled") {
    return { canSwap: false, reason: "Only scheduled shifts can be swapped." }
  }
  if (hasPendingSwap) {
    return { canSwap: false, reason: "There is already a pending swap for one of these shifts." }
  }
  return { canSwap: true, reason: null }
}
