# HRMS M4c — Frontend Schedule + Attendance + M4 Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Frontend for schedule + attendance. A `MySchedulePage` (employee's published shifts + clock-in/out widget), a `RosterPage` (manager's grid view + bulk-pattern + publish). Then close M4: merge to master, tag `v0.1.0-m4`.

**Architecture:**
- New frontend module: `apps/web/src/modules/attendance/` + `apps/web/src/modules/schedule/`
- API clients: thin wrappers around `openapi-fetch`
- Pages: `MySchedulePage` (employee-facing), `RosterPage` (manager-facing)
- TopBar gating: `useCan` for "Schedule" link visible to managers, "My Schedule" link for everyone

**Branch:** `m4/schedule` (current).

---

## Task 1: API clients + MySchedulePage (employee)

**Files:**
- Create: `apps/web/src/modules/schedule/api.ts`
- Create: `apps/web/src/modules/attendance/api.ts`
- Create: `apps/web/src/modules/schedule/routes.tsx`
- Create: `apps/web/src/modules/schedule/pages/MySchedulePage.tsx`
- Modify: `apps/web/src/App.tsx` (mount routes)
- Modify: `apps/web/src/components/shell/TopBar.tsx` (add nav)

- [ ] **Step 1: API clients**

`apps/web/src/modules/schedule/api.ts`:

```typescript
import { api } from "@/lib/api"

export type Shift = { id: string; name: string; start_time: string; end_time: string; crosses_midnight: boolean; color: string }
export type ShiftAssignment = {
  id: string
  employee: string
  employee_code: string
  shift: string
  shift_name: string
  work_date: string
  status: string
  published_at: string | null
  is_published: boolean
  notes: string
}
export type Holiday = { id: string; date: string; name: string; type: string }

async function _get<T>(url: string): Promise<T> {
  const { data, error } = await api.GET(url as never)
  if (error) throw new Error(`GET ${url} failed`)
  return data as T
}
async function _post<T>(url: string, body?: unknown): Promise<T> {
  const opts = body !== undefined ? ({ body: body as never } as never) : (undefined as never)
  const { data, error } = await api.POST(url as never, opts)
  if (error) throw new Error(`POST ${url} failed`)
  return data as T
}

function _unwrap<T>(d: { results?: T[] } | T[]): T[] {
  return Array.isArray(d) ? d : d.results || []
}

export const scheduleApi = {
  myAssignments: (from: string, to: string) =>
    _get<{ results?: ShiftAssignment[] } | ShiftAssignment[]>(
      `/api/v1/schedule/shift-assignments/me/?from=${from}&to=${to}`
    ).then(_unwrap),
  listAssignments: (from: string, to: string) =>
    _get<{ results?: ShiftAssignment[] } | ShiftAssignment[]>(
      `/api/v1/schedule/shift-assignments/?from=${from}&to=${to}`
    ).then(_unwrap),
  listShifts: () => _get<{ results?: Shift[] } | Shift[]>("/api/v1/schedule/shifts/").then(_unwrap),
  listHolidays: (year: number) =>
    _get<{ results?: Holiday[] } | Holiday[]>(`/api/v1/schedule/holidays/?year=${year}`).then(_unwrap),
  bulkAssign: (body: {
    employee_ids: string[]
    pattern: Record<string, string>
    date_from: string
    date_to: string
    notes?: string
  }) => _post("/api/v1/schedule/shift-assignments/bulk-pattern/", body),
  publish: (date_from: string, date_to: string) =>
    _post<{ published: number }>("/api/v1/schedule/shift-assignments/publish/", { date_from, date_to }),
}
```

`apps/web/src/modules/attendance/api.ts`:

```typescript
import { api } from "@/lib/api"

export type AttendanceRecord = {
  id?: string
  work_date?: string
  clock_in: string | null
  clock_out: string | null
  status: string
  computed_hours?: number | null
  is_holiday_work?: boolean
}

async function _get<T>(url: string): Promise<T> {
  const { data, error } = await api.GET(url as never)
  if (error) throw new Error(`GET ${url} failed`)
  return data as T
}
async function _post<T>(url: string): Promise<T> {
  const { data, error } = await api.POST(url as never, undefined as never)
  if (error) throw new Error(`POST ${url} failed`)
  return data as T
}

export const attendanceApi = {
  today: () => _get<AttendanceRecord>("/api/v1/attendance/today/"),
  clockIn: () => _post<AttendanceRecord>("/api/v1/attendance/clock-in/"),
  clockOut: () => _post<AttendanceRecord>("/api/v1/attendance/clock-out/"),
  records: (from?: string, to?: string) => {
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    return _get<AttendanceRecord[]>(`/api/v1/attendance/records/?${qs.toString()}`)
  },
}
```

- [ ] **Step 2: MySchedulePage**

`apps/web/src/modules/schedule/pages/MySchedulePage.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react"

import { attendanceApi, type AttendanceRecord } from "@/modules/attendance/api"
import { scheduleApi, type ShiftAssignment } from "../api"

function startOfWeekISO(d: Date): string {
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = (day + 6) % 7   // turn into days-since-Monday
  const monday = new Date(d)
  monday.setDate(d.getDate() - diff)
  return monday.toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function MySchedulePage() {
  const today = new Date()
  const [weekStart, setWeekStart] = useState<string>(startOfWeekISO(today))
  const weekEnd = addDaysISO(weekStart, 6)
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [todayRec, setTodayRec] = useState<AttendanceRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [a, t] = await Promise.all([
        scheduleApi.myAssignments(weekStart, weekEnd),
        attendanceApi.today(),
      ])
      setAssignments(a)
      setTodayRec(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function clockIn() {
    setBusy(true)
    try {
      await attendanceApi.clockIn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clock-in failed")
    } finally {
      setBusy(false)
    }
  }

  async function clockOut() {
    setBusy(true)
    try {
      await attendanceApi.clockOut()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clock-out failed")
    } finally {
      setBusy(false)
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
  const todayIso = today.toISOString().slice(0, 10)

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">My Schedule</h1>

      {error && <p role="alert" className="text-red-600">{error}</p>}

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Today — {todayIso}</h2>
        <p className="text-sm text-slate-600 mb-2">
          Clock-in: <strong>{todayRec?.clock_in ? new Date(todayRec.clock_in).toLocaleTimeString() : "—"}</strong>
          {"  •  "}
          Clock-out: <strong>{todayRec?.clock_out ? new Date(todayRec.clock_out).toLocaleTimeString() : "—"}</strong>
          {"  •  "}
          Status: <strong>{todayRec?.status ?? "no_record"}</strong>
          {todayRec?.is_holiday_work && <span className="ml-2 text-amber-700">• Holiday work</span>}
        </p>
        <div className="space-x-2">
          <button
            onClick={clockIn}
            disabled={busy || (!!todayRec?.clock_in)}
            className="bg-slate-900 text-white py-1.5 px-3 rounded text-sm disabled:opacity-50"
          >
            {busy ? "..." : "Clock in"}
          </button>
          <button
            onClick={clockOut}
            disabled={busy || !todayRec?.clock_in || !!todayRec?.clock_out}
            className="bg-slate-700 text-white py-1.5 px-3 rounded text-sm disabled:opacity-50"
          >
            {busy ? "..." : "Clock out"}
          </button>
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Week of {weekStart}</h2>
          <div className="space-x-2 text-sm">
            <button onClick={() => setWeekStart(addDaysISO(weekStart, -7))} className="text-slate-600 hover:text-slate-900">← Previous</button>
            <button onClick={() => setWeekStart(addDaysISO(weekStart, 7))} className="text-slate-600 hover:text-slate-900">Next →</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => <th key={d} className="py-1">{d} {days[i].slice(5)}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              {days.map((iso) => {
                const a = assignments.find((x) => x.work_date === iso)
                return (
                  <td key={iso} className="py-2 align-top">
                    {a ? (
                      <span className="text-xs px-2 py-1 rounded bg-slate-100">{a.shift_name}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Routes + nav + RosterPage stub**

`apps/web/src/modules/schedule/routes.tsx`:

```tsx
import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const MySchedulePage = lazy(() => import("./pages/MySchedulePage"))
const RosterPage = lazy(() => import("./pages/RosterPage"))

export const scheduleRoutes: RouteObject[] = [
  { path: "schedule/me", element: <MySchedulePage /> },
  { path: "schedule/roster", element: <RosterPage /> },
]
```

Stub `apps/web/src/modules/schedule/pages/RosterPage.tsx` with `export default function() { return <p>TODO Task 2</p> }`.

Modify `apps/web/src/App.tsx`. Add `scheduleRoutes` import and include them in the AppShell children (same pattern as leaveRoutes/employeeRoutes).

Modify `apps/web/src/components/shell/TopBar.tsx`:

```tsx
{useCan("attendance:clock:self") && (
  <Link to="/schedule/me" className="text-slate-600 hover:text-slate-900">Schedule</Link>
)}
{useCan("schedule:assignment:write:team") && (
  <Link to="/schedule/roster" className="text-slate-600 hover:text-slate-900">Roster</Link>
)}
```

- [ ] **Step 4: Build + commit**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): MySchedulePage with clock-in/out widget + week view"
```

---

## Task 2: RosterPage (manager view + bulk-pattern + publish)

**Files:**
- Create / replace: `apps/web/src/modules/schedule/pages/RosterPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useCallback, useEffect, useMemo, useState } from "react"

import { scheduleApi, type Shift, type ShiftAssignment } from "../api"

function startOfWeekISO(d: Date): string {
  const day = d.getDay()
  const diff = (day + 6) % 7
  const m = new Date(d)
  m.setDate(d.getDate() - diff)
  return m.toISOString().slice(0, 10)
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const

export default function RosterPage() {
  const today = new Date()
  const [weekStart, setWeekStart] = useState<string>(startOfWeekISO(today))
  const weekEnd = addDaysISO(weekStart, 6)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  // Bulk-assign form state
  const [employeeIds, setEmployeeIds] = useState<string>("")
  const [pattern, setPattern] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [s, a] = await Promise.all([
        scheduleApi.listShifts(),
        scheduleApi.listAssignments(weekStart, weekEnd),
      ])
      setShifts(s)
      setAssignments(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Roster grouped by employee
  const grid = useMemo(() => {
    const byEmp: Record<string, { code: string; days: Record<string, ShiftAssignment | undefined> }> = {}
    for (const a of assignments) {
      if (!byEmp[a.employee]) byEmp[a.employee] = { code: a.employee_code, days: {} }
      byEmp[a.employee].days[a.work_date] = a
    }
    return byEmp
  }, [assignments])

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))

  async function applyBulk() {
    setBusy(true)
    setError(null)
    try {
      const ids = employeeIds.split(",").map((s) => s.trim()).filter(Boolean)
      const cleanPattern: Record<string, string> = {}
      for (const k of WEEKDAYS) if (pattern[k]) cleanPattern[k] = pattern[k]
      await scheduleApi.bulkAssign({
        employee_ids: ids,
        pattern: cleanPattern,
        date_from: weekStart,
        date_to: weekEnd,
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk assign failed")
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    try {
      const r = await scheduleApi.publish(weekStart, weekEnd)
      alert(`Published ${r.published} assignments`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roster — Week of {weekStart}</h1>
        <div className="space-x-2 text-sm">
          <button onClick={() => setWeekStart(addDaysISO(weekStart, -7))} className="text-slate-600 hover:text-slate-900">← Previous</button>
          <button onClick={() => setWeekStart(addDaysISO(weekStart, 7))} className="text-slate-600 hover:text-slate-900">Next →</button>
        </div>
      </div>

      {error && <p role="alert" className="text-red-600">{error}</p>}

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-semibold">Bulk assign pattern</h2>
        <label className="block text-sm">
          Employee IDs (comma-separated UUIDs)
          <input
            value={employeeIds}
            onChange={(e) => setEmployeeIds(e.target.value)}
            className="w-full border rounded px-2 py-1 mt-1 font-mono text-xs"
            placeholder="uuid1, uuid2, uuid3"
          />
        </label>
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d} className="text-xs">
              <span className="block text-slate-500 capitalize mb-1">{d}</span>
              <select
                value={pattern[d] || ""}
                onChange={(e) => setPattern({ ...pattern, [d]: e.target.value })}
                className="w-full border rounded px-1 py-1 text-xs"
              >
                <option value="">Off</option>
                {shifts.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </label>
          ))}
        </div>
        <div className="space-x-2">
          <button onClick={applyBulk} disabled={busy || !employeeIds || Object.values(pattern).every((v) => !v)} className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
            {busy ? "..." : "Apply pattern"}
          </button>
          <button onClick={publish} disabled={busy} className="bg-green-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
            {busy ? "..." : "Publish week"}
          </button>
        </div>
      </section>

      <section className="bg-white border rounded p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Roster grid</h2>
        {Object.keys(grid).length === 0 ? (
          <p className="text-slate-500 text-sm">No assignments for this week.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Employee</th>
                {days.map((iso) => <th key={iso} className="py-1">{iso.slice(5)}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grid).map(([empId, row]) => (
                <tr key={empId} className="border-t">
                  <td className="py-1.5 font-mono text-xs">{row.code}</td>
                  {days.map((iso) => {
                    const a = row.days[iso]
                    return (
                      <td key={iso} className="py-1.5">
                        {a ? (
                          <span className={`text-xs px-2 py-0.5 rounded ${a.is_published ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                            {a.shift_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Build + commit**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): RosterPage with grid + bulk-pattern + publish"
```

---

## Task 3: M4 milestone close

- [ ] **Step 1: Update CHANGELOG**

Edit `CHANGELOG.md`. Add after the M3 block:

```markdown
## [0.1.0-m4] - 2026-04-28

### Added
- **M4a — Schedule data layer:** `WorkSchedule`, `Shift`, `ShiftAssignment`, `Holiday` models. `ScheduleService` with `get_pattern_for_date`, `bulk_assign_pattern`, `publish_for_period`. `HolidayService` with `is_holiday`, `get_for_date`, `sync_from_country`. `seed_holidays_from_country` management command. Endpoints `/api/v1/schedule/{work-schedules,shifts,shift-assignments,holidays}` + `/shift-assignments/{bulk-pattern,publish,me}`.
- **M4b — Attendance:** `AttendanceRecord` (one per (employee, work_date)), `AttendanceService` with idempotent `clock_in`/`clock_out`/`today`. Holiday-replacement rule: when a `schedule_type='shift'` employee clocks in on a public holiday, the `attendance_clocked` signal fires and `BalanceService.grant_replacement` adds +1 day to their REPLACEMENT leave (idempotent on the attendance record reference). Endpoints `/api/v1/attendance/{clock-in,clock-out,today,records,team}`.
- **M4c — Frontend:** `MySchedulePage` (clock-in/out widget + weekly schedule grid), `RosterPage` (manager grid view + bulk-pattern + publish). TopBar nav: "Schedule" (everyone with `attendance:clock:self`) + "Roster" (managers).
- 15 new permission codes (M4): `schedule:*`, `attendance:*`. Catalogue grew from 43 to 58.
```

- [ ] **Step 2: Commit + tag**

```
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M4 milestone complete — release 0.1.0-m4"
git tag -a v0.1.0-m4 -m "M4: Schedule + Attendance (with holiday-replacement rule)"
```

- [ ] **Step 3: Merge to master**

```
git checkout master
git merge --ff-only m4/schedule
git branch -d m4/schedule
```

Verify:

```
git log --oneline -5
git tag -l "v*"
cd apps/api && uv run pytest -q 2>&1 | tail -5; cd ../..
cd apps/web && pnpm test 2>&1 | tail -5; cd ../..
```

Expected: master at v0.1.0-m4 commit; 5 tags present; backend ~268 tests + frontend ~5 tests, all green.

---

## M4 Close Acceptance Criteria

- [ ] Employee at `/schedule/me` sees clock-in/out widget + this week's published schedule
- [ ] Manager at `/schedule/roster` sees grid + can bulk-assign + publish
- [ ] All M4a + M4b + M4c tests green
- [ ] Permission catalogue ≥ 58 codes
- [ ] Pre-commit clean
- [ ] `m4/schedule` merged FF to master
- [ ] Tag `v0.1.0-m4` exists on master HEAD
- [ ] All 5 tags (`v0.1.0-m{0,1,2,3,4}`) present

That closes M4. Next milestone: **M5 — Claims** (smaller; reuses M3a workflow engine).
