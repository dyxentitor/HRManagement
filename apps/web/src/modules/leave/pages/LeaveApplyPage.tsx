import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { employeeApi } from "@/modules/employee/api"

import { type Coverage, type Holiday, type LeaveBalance, type LeaveType, leaveApi } from "../api"
import { LeaveRangeCalendar } from "../components/LeaveRangeCalendar"
import { formatRange, ymd } from "../lib/leave-dates"

function diffInDays(start: string, end: string): number {
  if (!start || !end) return 0
  const a = new Date(`${start}T00:00:00Z`)
  const b = new Date(`${end}T00:00:00Z`)
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000 + 1)
}

// `?start=` is user-controllable (deep link from a schedule shift card's
// "Apply for leave this day" menu item) and flows into the `start_date`
// field of the apply POST body. Require a strict YYYY-MM-DD shape, then
// round-trip through Date/ymd to reject syntactically-valid-but-nonsense
// dates (e.g. "2026-02-30", which `Date` silently rolls forward to
// 2026-03-02 instead of rejecting) — the backend re-validates regardless,
// this is defence in depth so the prefilled range shown to the user is
// never silently wrong.
function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && ymd(d) === value
}

export default function LeaveApplyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetType = searchParams.get("type")
  // Deep-link from a schedule shift card: /leave/apply?start=YYYY-MM-DD
  const presetStart = searchParams.get("start")
  const [noEmployee, setNoEmployee] = useState(false)
  const [types, setTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [coverage, setCoverage] = useState<Coverage | null>(null)

  const [leaveType, setLeaveType] = useState("")
  const [range, setRange] = useState(() => {
    const valid = presetStart && isValidDateKey(presetStart) ? presetStart : ""
    return { start: valid, end: valid }
  })
  const [isHalfDay, setIsHalfDay] = useState(false)
  const [halfDayPeriod, setHalfDayPeriod] = useState("am")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    employeeApi.getMe().then((emp) => {
      if (!emp) {
        setNoEmployee(true)
        return
      }
      leaveApi
        .listTypes()
        .then((t) => {
          setTypes(t)
          // Preselect the type passed from the My Leave "Take leave" cards.
          if (presetType && t.some((x) => x.id === presetType)) setLeaveType(presetType)
        })
        .catch(() => setError("Failed to load leave types"))
      leaveApi
        .myBalances()
        .then(setBalances)
        .catch(() => undefined)
      leaveApi
        .holidays(new Date().getFullYear())
        .then(setHolidays)
        .catch(() => setHolidays([]))
    })
  }, [presetType])

  // Coverage for the chosen range (clash awareness).
  useEffect(() => {
    if (!range.start || !range.end) {
      setCoverage(null)
      return
    }
    leaveApi
      .coverage(range.start, range.end)
      .then(setCoverage)
      .catch(() => setCoverage(null))
  }, [range.start, range.end])

  const totalDays = isHalfDay ? 0.5 : diffInDays(range.start, range.end)

  const selectedBalance = useMemo(() => {
    const t = types.find((x) => x.id === leaveType)
    return t ? balances.find((b) => b.leave_type_code === t.code) : undefined
  }, [types, balances, leaveType])

  const available = Number(selectedBalance?.available ?? 0)
  const after = available - totalDays

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await leaveApi.apply({
        leave_type: leaveType,
        start_date: range.start,
        end_date: range.end,
        total_days: String(totalDays),
        is_half_day: isHalfDay,
        half_day_period: isHalfDay ? halfDayPeriod : "",
        reason,
      })
      await leaveApi.submit(created.id)
      navigate("/leave/me")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply")
    } finally {
      setSubmitting(false)
    }
  }

  if (noEmployee) {
    return (
      <div className="max-w-xl space-y-4">
        <PageHeader title="Apply for leave" />
        <NotLinkedEmptyState scope="leave" />
      </div>
    )
  }

  const canSubmit =
    !submitting && leaveType !== "" && range.start !== "" && range.end !== "" && totalDays > 0

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PageHeader
        title="Apply for leave"
        subtitle="Pick a type and your dates — we'll show the impact."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[240px]">
          <span className="text-label text-text-tertiary block mb-1">Leave type</span>
          <Select value={leaveType} onValueChange={setLeaveType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a type…" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => {
                const bal = balances.find((b) => b.leave_type_code === t.code)
                return (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {bal ? ` · ${Number(bal.available)} left` : ""}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
        <label htmlFor="half-day-toggle" className="flex items-center gap-2.5 cursor-pointer pb-2">
          <Switch
            id="half-day-toggle"
            checked={isHalfDay}
            onCheckedChange={(v) => {
              setIsHalfDay(v)
              if (v && range.start) setRange({ start: range.start, end: range.start })
            }}
          />
          <span className="text-small text-text-secondary">Half day</span>
          {isHalfDay && (
            <Select value={halfDayPeriod} onValueChange={setHalfDayPeriod}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="am">Morning</SelectItem>
                <SelectItem value="pm">Afternoon</SelectItem>
              </SelectContent>
            </Select>
          )}
        </label>
      </div>

      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
        <div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
          <LeaveRangeCalendar
            value={range}
            onChange={(v) => setRange(isHalfDay ? { start: v.start, end: v.start } : v)}
            holidays={holidays}
            coverage={coverage?.per_day}
          />
          <div className="mt-4">
            <span className="text-label text-text-tertiary block mb-1">Reason</span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="What's it for…"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="glass-surface rounded-xl p-4">
            <span className="text-label text-text-tertiary block mb-2">Request summary</span>
            <p className="text-h1 text-text-primary leading-none">
              {totalDays} <span className="text-h3 text-text-tertiary">days</span>
            </p>
            <p className="text-small text-text-tertiary mt-1">
              {range.start ? formatRange(range.start, range.end) : "Pick your dates"}
            </p>
            <div className="mt-3 space-y-1.5 text-small">
              <div className="flex justify-between border-t border-border-subtle pt-1.5">
                <span className="text-text-tertiary">Available</span>
                <span className="tabular-nums">{available} d</span>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-1.5">
                <span className="text-text-tertiary">This request</span>
                <span className="tabular-nums text-coral">−{totalDays} d</span>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-1.5">
                <span className="text-text-tertiary">Balance after</span>
                <span className={`tabular-nums ${after < 0 ? "text-coral" : "text-mint"}`}>
                  {after} d
                </span>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-1.5">
                <span className="text-text-tertiary">Approver</span>
                <span>Your manager</span>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-coral text-small mt-3">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!canSubmit} className="w-full mt-3 soft-glow">
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </div>

          {coverage?.per_day && Object.keys(coverage.per_day).length > 0 && (
            <div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
              <span className="text-label text-text-tertiary block mb-2">
                Heads up · your team that week
              </span>
              {coverage.people.length > 0 ? (
                <ul className="space-y-1 text-small">
                  {coverage.people.slice(0, 4).map((p) => (
                    <li key={`${p.employee_id}-${p.start}`} className="flex justify-between">
                      <span className="text-text-secondary">{p.name}</span>
                      <span className="text-coral">off {formatRange(p.start, p.end)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-coral">
                  {Math.max(...Object.values(coverage.per_day))} teammate(s) off during these dates.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
