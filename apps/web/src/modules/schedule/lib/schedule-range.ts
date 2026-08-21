/**
 * Range derivation for the employee schedule workspace.
 *
 * One `(view, anchor)` pair drives the tab shell, the fetch range and the
 * nav label. Agenda deliberately shares Month's range so the ‹ › controls
 * mean the same thing on every tab.
 *
 * All arithmetic is UTC-anchored per CLAUDE.md §3.9 — these functions take
 * and return YYYY-MM-DD keys, never local-time `Date` objects.
 */

import { addDaysIso } from "./local-date"

export type ScheduleView = "month" | "week" | "agenda"

export interface DateRange {
  from: string
  to: string
}

/** UTC day-of-week, 0=Sun..6=Sat, for a YYYY-MM-DD key. */
function utcDow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

/** YYYY-MM-DD of the Monday of the week containing `iso`. */
export function startOfWeekIso(iso: string): string {
  return addDaysIso(iso, -((utcDow(iso) + 6) % 7))
}

/** Move `months` calendar months from `iso`, normalised to the 1st. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, "0")}-01`
}

/** Number of days in the calendar month containing `iso`. */
function daysInMonth(iso: string): number {
  const [y, m] = iso.split("-").map(Number)
  // Day 0 of the *next* month is the last day of this one.
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Every date the month grid renders: whole Monday-first weeks spanning the
 * anchor's month, including leading/trailing days from adjacent months.
 * Always a multiple of 7.
 */
export function monthGridDays(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`
  const last = addDaysIso(first, daysInMonth(anchor) - 1)
  const start = startOfWeekIso(first)
  const end = addDaysIso(startOfWeekIso(last), 6)

  const out: string[] = []
  for (let d = start; d <= end; d = addDaysIso(d, 1)) out.push(d)
  return out
}

/** The date range a view needs fetched for the given anchor. */
export function rangeFor(view: ScheduleView, anchor: string): DateRange {
  if (view === "week") {
    const from = startOfWeekIso(anchor)
    return { from, to: addDaysIso(from, 6) }
  }
  const days = monthGridDays(anchor)
  return { from: days[0], to: days[days.length - 1] }
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    ...opts,
    timeZone: "UTC",
  })
}

/** Human label for the nav bar — "August 2026" or "17 – 23 August 2026". */
export function rangeLabel(view: ScheduleView, anchor: string): string {
  if (view !== "week") {
    return fmt(anchor, { month: "long", year: "numeric" })
  }
  const from = startOfWeekIso(anchor)
  const to = addDaysIso(from, 6)
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${fmt(from, { day: "numeric" })} – ${fmt(to, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`
  }
  return `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`
}

/** Anchor for the previous (-1) or next (+1) period. */
export function shiftAnchor(view: ScheduleView, anchor: string, direction: -1 | 1): string {
  if (view === "week") return addDaysIso(startOfWeekIso(anchor), 7 * direction)
  return addMonthsIso(anchor, direction)
}
