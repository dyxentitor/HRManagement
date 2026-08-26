import { AlertTriangle, Check, Loader2, Search } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import type { Shift } from "../api"
import { formatTimeRange, shiftHours } from "../lib/shift-hours"
import { weekdayLabel } from "../lib/weekday"
import { type SwapCandidate, createSwapRequest, listSwapCandidates } from "../swap-api"

/** One of the requester's own shifts, offered as the swap source in step 1. */
export interface SwapSourceShift {
  assignmentId: string
  date: string
  shiftName: string
  shiftCode: string
  timeRange: string
  hours: number
}

interface Props {
  open: boolean
  /** Preselected source — the shift whose ⋯ menu opened this drawer. */
  assignmentId: string | null
  /** The requester's other swappable shifts, so step 1 can change the source. */
  sources: SwapSourceShift[]
  /** Shift catalogue for the type filter. Empty when the fetch failed (§3.7). */
  shifts: Shift[]
  onClose: () => void
  onCreated: () => void
}

const PAGE_SIZE = 8
const SEARCH_MIN_CHARS = 2
const SEARCH_DEBOUNCE_MS = 300
const STEPS = ["Your shift", "Choose a swap", "Review"] as const

function longDate(iso: string): string {
  if (!iso) return ""
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function dayAndDate(iso: string): string {
  if (!iso) return ""
  return `${weekdayLabel(iso, "short")}, ${longDate(iso)}`
}

function candidateHours(c: SwapCandidate): number {
  return shiftHours(c.shift_start, c.shift_end, c.shift_crosses_midnight)
}

/**
 * Three-step shift-swap request, in a focused drawer.
 *
 * Replaces the inline card that used to expand under the calendar: that grew
 * the page, pushed the rail down, and rendered every teammate shift in the org
 * as a radio list — unusable past a few dozen employees. Here the candidate
 * search is paged and filtered server-side, and the footer actions sit outside
 * the scroll area so they are reachable without scrolling the results.
 *
 * Only reciprocal swaps exist: `execute_swap` exchanges the (work_date, shift)
 * pair between two assignment rows, so every request needs a counterparty
 * shift. There is deliberately no "find cover" option here — the backend has no
 * one-sided coverage request to submit it to.
 *
 * Focus trap, Escape-to-close and focus restoration come from Radix's Dialog
 * underneath `<Sheet>`.
 */
export function SwapRequestDrawer({
  open,
  assignmentId,
  sources,
  shifts,
  onClose,
  onCreated,
}: Props) {
  const [step, setStep] = useState(0)
  const [sourceId, setSourceId] = useState<string | null>(assignmentId)
  const [selected, setSelected] = useState<SwapCandidate | null>(null)
  const [reason, setReason] = useState("")

  // Filters
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [shiftFilter, setShiftFilter] = useState("")

  // Results
  const [candidates, setCandidates] = useState<SwapCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Two error slots, not one. A refused submit sends the user back to the
  // picker, which re-runs the candidate fetch — with a single slot that fetch
  // would immediately clear the very message explaining why they were sent
  // back. Both render into the same alert region.
  const [searchError, setSearchError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Re-seed from the calendar each time the drawer is opened, so launching it
  // from a different shift never inherits the previous run's selection.
  useEffect(() => {
    if (!open) return
    setSourceId(assignmentId)
    setStep(0)
    setSelected(null)
    setReason("")
    setSearch("")
    setDebouncedSearch("")
    setDateFrom("")
    setDateTo("")
    setShiftFilter("")
    setSearchError(null)
    setSubmitError(null)
    setConfirmed(false)
  }, [open, assignmentId])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  /**
   * Changing the source shift invalidates any candidate picked against the old
   * one — the server validates the *pair*, so the choice cannot carry over.
   * Everything else the user has entered (reason, filters) deliberately
   * survives moving between steps.
   */
  const changeSource = useCallback((id: string) => {
    setSourceId(id)
    setSelected(null)
  }, [])

  const source = useMemo(
    () => sources.find((s) => s.assignmentId === sourceId) ?? null,
    [sources, sourceId],
  )

  // Monotonic guard: filter keystrokes and "Load more" race each other, and a
  // stale response must never overwrite a newer one (same pattern as
  // MySchedulePage.refresh).
  const seqRef = useRef(0)

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!sourceId) return
      const seq = ++seqRef.current
      setLoading(true)
      setSearchError(null)
      try {
        const data = await listSwapCandidates({
          assignmentId: sourceId,
          q: debouncedSearch.length >= SEARCH_MIN_CHARS ? debouncedSearch : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          shift: shiftFilter || undefined,
          page: targetPage,
          pageSize: PAGE_SIZE,
        })
        if (seq !== seqRef.current) return
        setCandidates((prev) => (append ? [...prev, ...data.results] : data.results))
        setTotal(data.count)
        setPage(data.page)
        setBlockedReason(data.blocked_reason)
      } catch (e) {
        if (seq !== seqRef.current) return
        setSearchError(e instanceof Error ? e.message : String(e))
        if (!append) setCandidates([])
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [sourceId, debouncedSearch, dateFrom, dateTo, shiftFilter],
  )

  // Only fetch once the user is actually on the picker step — opening the
  // drawer on step 1 shouldn't spend a round-trip they may never need.
  useEffect(() => {
    if (!open || step !== 1) return
    fetchPage(1, false)
  }, [open, step, fetchPage])

  async function submit() {
    if (!sourceId || !selected) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await createSwapRequest({
        requesterAssignmentId: sourceId,
        counterpartyAssignmentId: selected.id,
        reason,
      })
      onCreated()
    } catch (e) {
      // The server re-runs validate_pair, so a candidate that looked fine can
      // still be refused here (the roster moved). Send them back to the picker.
      setSubmitError(e instanceof Error ? e.message : String(e))
      setStep(1)
      setConfirmed(false)
    } finally {
      setSubmitting(false)
    }
  }

  const hasMore = candidates.length < total
  const canContinue = step === 0 ? Boolean(sourceId) : step === 1 ? Boolean(selected) : confirmed

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        side="right"
        // 640px sits in the 560–680 band on desktop; full-bleed below `sm`.
        // `p-0` + column layout is what pins the header and footer while only
        // the middle scrolls.
        className="w-full sm:max-w-[640px] p-0 flex flex-col gap-0 bg-surface"
      >
        <SheetHeader className="shrink-0 border-b border-border-subtle p-5 space-y-1 text-left">
          <SheetTitle className="text-h3 text-text-primary">Request a shift swap</SheetTitle>
          <SheetDescription className="text-small text-text-secondary">
            Trade one of your shifts with a colleague. Your manager approves the swap.
          </SheetDescription>
          <StepIndicator current={step} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {(submitError ?? searchError) && (
            <p
              role="alert"
              className="text-small text-coral bg-coral/10 border border-coral/30 rounded-lg px-3 py-2"
            >
              {submitError ?? searchError}
            </p>
          )}

          {step === 0 && (
            <SourceStep sources={sources} sourceId={sourceId} onSelect={changeSource} />
          )}

          {step === 1 && (
            <PickerStep
              source={source}
              candidates={candidates}
              selected={selected}
              onSelect={setSelected}
              loading={loading}
              hasMore={hasMore}
              total={total}
              blockedReason={blockedReason}
              onLoadMore={() => fetchPage(page + 1, true)}
              search={search}
              onSearch={setSearch}
              dateFrom={dateFrom}
              onDateFrom={setDateFrom}
              dateTo={dateTo}
              onDateTo={setDateTo}
              shiftFilter={shiftFilter}
              onShiftFilter={setShiftFilter}
              shifts={shifts}
              onClearFilters={() => {
                setSearch("")
                setDateFrom("")
                setDateTo("")
                setShiftFilter("")
              }}
            />
          )}

          {step === 2 && source && selected && (
            <ReviewStep
              source={source}
              candidate={selected}
              reason={reason}
              onReason={setReason}
              confirmed={confirmed}
              onConfirm={setConfirmed}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-border-subtle p-4 flex items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          {step < 2 ? (
            <Button type="button" disabled={!canContinue} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={!canContinue || submitting} onClick={submit}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 pt-2" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 text-small rounded-full px-2 py-0.5",
              i === current
                ? "bg-accent-500/15 text-accent-200 font-semibold"
                : i < current
                  ? "text-mint"
                  : "text-text-tertiary",
            )}
          >
            {i < current ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <span aria-hidden>{i + 1}.</span>
            )}
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <span className="text-text-tertiary" aria-hidden>
              ›
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 1 — which of my shifts am I giving up?                                 */
/* -------------------------------------------------------------------------- */

function SourceStep({
  sources,
  sourceId,
  onSelect,
}: {
  sources: SwapSourceShift[]
  sourceId: string | null
  onSelect: (id: string) => void
}) {
  if (sources.length === 0) {
    return (
      <p className="text-small text-text-secondary">
        You have no upcoming shifts that can be swapped. Only future, published shifts without a
        pending request are eligible.
      </p>
    )
  }

  return (
    <fieldset>
      <legend className="text-label uppercase text-text-tertiary mb-2">
        The shift you want to give up
      </legend>
      <div className="space-y-2">
        {sources.map((s) => {
          const active = s.assignmentId === sourceId
          return (
            <label
              key={s.assignmentId}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer min-h-[44px]",
                "focus-within:ring-2 focus-within:ring-accent-500",
                active
                  ? "border-accent-500 bg-accent-500/10"
                  : "border-border-subtle hover:bg-surface-hover",
              )}
            >
              <input
                type="radio"
                name="swap-source"
                className="accent-accent-500"
                value={s.assignmentId}
                checked={active}
                onChange={() => onSelect(s.assignmentId)}
              />
              <span className="min-w-0">
                <span className="block text-body text-text-primary font-medium">
                  {dayAndDate(s.date)}
                </span>
                <span className="block text-small text-text-secondary">
                  {s.shiftName}
                  {s.timeRange && ` · ${s.timeRange}`}
                  {s.hours > 0 && ` · ${s.hours}h`}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 2 — find a compatible colleague shift                                  */
/* -------------------------------------------------------------------------- */

function PickerStep({
  source,
  candidates,
  selected,
  onSelect,
  loading,
  hasMore,
  total,
  blockedReason,
  onLoadMore,
  search,
  onSearch,
  dateFrom,
  onDateFrom,
  dateTo,
  onDateTo,
  shiftFilter,
  onShiftFilter,
  shifts,
  onClearFilters,
}: {
  source: SwapSourceShift | null
  candidates: SwapCandidate[]
  selected: SwapCandidate | null
  onSelect: (c: SwapCandidate) => void
  loading: boolean
  hasMore: boolean
  total: number
  blockedReason: string | null
  onLoadMore: () => void
  search: string
  onSearch: (v: string) => void
  dateFrom: string
  onDateFrom: (v: string) => void
  dateTo: string
  onDateTo: (v: string) => void
  shiftFilter: string
  onShiftFilter: (v: string) => void
  shifts: Shift[]
  onClearFilters: () => void
}) {
  const filtersActive = Boolean(search || dateFrom || dateTo || shiftFilter)

  return (
    <div className="space-y-4">
      {source && (
        <p className="text-small text-text-secondary">
          Swapping <span className="text-text-primary">{dayAndDate(source.date)}</span> ·{" "}
          {source.shiftName}
        </p>
      )}

      {blockedReason && (
        <p role="alert" className="text-small text-yellow">
          {blockedReason}
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="swap-search" className="sr-only">
          Search for a colleague
        </label>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary"
            aria-hidden
          />
          <Input
            id="swap-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by name or employee code…"
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label
              htmlFor="swap-date-from"
              className="block text-label uppercase text-text-tertiary mb-1"
            >
              From
            </label>
            <Input
              id="swap-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="swap-date-to"
              className="block text-label uppercase text-text-tertiary mb-1"
            >
              To
            </label>
            <Input
              id="swap-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => onDateTo(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="swap-shift"
              className="block text-label uppercase text-text-tertiary mb-1"
            >
              Shift type
            </label>
            <select
              id="swap-shift"
              value={shiftFilter}
              onChange={(e) => onShiftFilter(e.target.value)}
              className="w-full h-9 bg-surface border border-border-subtle rounded-md px-2 text-small text-text-primary"
            >
              <option value="">Any shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-small text-text-tertiary" aria-live="polite">
          {loading && candidates.length === 0
            ? "Searching…"
            : total === 0
              ? "No matches"
              : `Showing ${candidates.length} of ${total}`}
        </p>
        {filtersActive && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-small text-accent-200 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {!loading && candidates.length === 0 ? (
        <div className="rounded-lg border border-border-subtle p-4 space-y-2">
          <p className="text-body text-text-primary">No compatible shifts found</p>
          <ul className="text-small text-text-secondary list-disc pl-4 space-y-0.5">
            <li>Widen the date range, or clear it entirely.</li>
            <li>Try a different shift type.</li>
            <li>Ask your manager whether cover can be arranged instead.</li>
          </ul>
        </div>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              source={source}
              selected={selected?.id === c.id}
              onSelect={() => onSelect(c)}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <Button type="button" variant="ghost" onClick={onLoadMore} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            `Load ${Math.min(PAGE_SIZE, total - candidates.length)} more`
          )}
        </Button>
      )}
    </div>
  )
}

function CandidateCard({
  candidate,
  source,
  selected,
  onSelect,
}: {
  candidate: SwapCandidate
  source: SwapSourceShift | null
  selected: boolean
  onSelect: () => void
}) {
  const hours = candidateHours(candidate)
  const initials = candidate.employee_name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!candidate.compatible}
        aria-pressed={selected}
        className={cn(
          "w-full text-left rounded-lg border px-3 py-2.5 flex gap-3 min-h-[44px]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
          selected
            ? "border-accent-500 bg-accent-500/10"
            : "border-border-subtle hover:bg-surface-hover",
          !candidate.compatible && "opacity-60 cursor-not-allowed hover:bg-transparent",
        )}
      >
        <span
          className="size-8 shrink-0 rounded-full bg-lavender/20 text-lavender grid place-items-center text-small font-semibold"
          aria-hidden
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="text-body text-text-primary font-medium">
              {candidate.employee_name}
            </span>
            <span className="text-small text-text-tertiary">{candidate.employee_code}</span>
            {candidate.department_name && (
              <span className="text-small text-text-tertiary">· {candidate.department_name}</span>
            )}
          </span>
          <span className="block text-small text-text-secondary">
            {dayAndDate(candidate.work_date)} · {candidate.shift_name}
          </span>
          <span className="block font-mono text-small text-text-secondary">
            {formatTimeRange(candidate.shift_start, candidate.shift_end)}
            {hours > 0 && ` · ${hours}h`}
          </span>

          {/* Status never relies on colour alone — each carries a word and a glyph. */}
          {candidate.compatible ? (
            <span className="mt-1 inline-flex items-center gap-1 text-small text-mint">
              <Check className="size-3.5" aria-hidden /> Compatible
            </span>
          ) : (
            <span className="mt-1 flex items-start gap-1 text-small text-yellow">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>Not compatible — {candidate.incompatible_reason}</span>
            </span>
          )}

          {candidate.warnings.map((w) => (
            <span key={w} className="block text-small text-text-tertiary">
              {w}
            </span>
          ))}
          {source && (
            <span className="sr-only">
              You would work {dayAndDate(candidate.work_date)} instead of {dayAndDate(source.date)}.
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 3 — review and confirm                                                 */
/* -------------------------------------------------------------------------- */

function ReviewStep({
  source,
  candidate,
  reason,
  onReason,
  confirmed,
  onConfirm,
}: {
  source: SwapSourceShift
  candidate: SwapCandidate
  reason: string
  onReason: (v: string) => void
  confirmed: boolean
  onConfirm: (v: boolean) => void
}) {
  const theirHours = candidateHours(candidate)
  const delta = Math.round((theirHours - source.hours) * 10) / 10

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ComparisonCard
          heading="You currently work"
          date={dayAndDate(source.date)}
          shift={source.shiftName}
          time={source.timeRange}
          hours={source.hours}
        />
        <ComparisonCard
          heading="You would work instead"
          date={dayAndDate(candidate.work_date)}
          shift={candidate.shift_name}
          time={formatTimeRange(candidate.shift_start, candidate.shift_end)}
          hours={theirHours}
          who={`${candidate.employee_name} (${candidate.employee_code})`}
          where={candidate.department_name ?? candidate.team_name}
          accent
        />
      </div>

      <dl className="rounded-lg border border-border-subtle divide-y divide-border-subtle text-small">
        <Row label="Change in hours">
          {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta}h`}
        </Row>
        <Row label="Goes to">Your manager, for approval</Row>
        <Row label="Approval required">Yes — the roster only changes once approved</Row>
      </dl>

      {candidate.warnings.length > 0 && (
        <ul className="space-y-1">
          {candidate.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-small text-yellow">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="swap-reason" className="block text-label uppercase text-text-tertiary mb-1">
          Reason (optional)
        </label>
        <textarea
          id="swap-reason"
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          rows={3}
          className="w-full bg-surface border border-border-subtle rounded-md px-2 py-1.5 text-text-primary text-small"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          className="accent-accent-500"
          checked={confirmed}
          onChange={(e) => onConfirm(e.target.checked)}
        />
        <span className="text-small text-text-secondary">
          I confirm I want to swap these two shifts with {candidate.employee_name}.
        </span>
      </label>
    </div>
  )
}

function ComparisonCard({
  heading,
  date,
  shift,
  time,
  hours,
  who,
  where,
  accent,
}: {
  heading: string
  date: string
  shift: string
  time: string
  hours: number
  who?: string
  where?: string | null
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        accent ? "border-accent-500/40 bg-accent-500/5" : "border-border-subtle",
      )}
    >
      <p className="text-label uppercase text-text-tertiary">{heading}</p>
      <p className="text-body text-text-primary font-medium mt-1">{date}</p>
      <p className="text-small text-text-secondary">{shift}</p>
      <p className="font-mono text-small text-text-secondary">
        {time}
        {hours > 0 && ` · ${hours}h`}
      </p>
      {who && <p className="text-small text-text-secondary mt-1">{who}</p>}
      {where && <p className="text-small text-text-tertiary">{where}</p>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-primary text-right">{children}</dd>
    </div>
  )
}
