# HRMS M3d — Frontend Leave UI + M3 Milestone Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing leave UI: an "Apply for leave" form, a "My Leave" page (balances + my requests with submit/cancel/withdraw), and a manager approvals inbox with approve/reject. Then close M3, merge to master, tag `v0.1.0-m3`.

**Architecture:**
- New frontend module: `apps/web/src/modules/leave/`
- Pages: `LeaveApplyPage`, `MyLeavePage`, `ApprovalsInboxPage`
- API client: `leaveApi` wrapping the typed `openapi-fetch` with helper methods
- Permission gating: route-level `<RouteGuard perms={[...]}>` from M1c; nav links visible only when perm held
- Approve/reject UI: side drawer with comment box (reject mandatory), buttons, optimistic refresh after action

**Branch:** `m3/workflow` (current).

---

## Task 1: Frontend leave module — API + apply form

**Files:**
- Create: `apps/web/src/modules/leave/api.ts`
- Create: `apps/web/src/modules/leave/routes.tsx`
- Create: `apps/web/src/modules/leave/pages/LeaveApplyPage.tsx`
- Create: `apps/web/src/modules/leave/pages/LeaveApplyPage.test.tsx`
- Modify: `apps/web/src/App.tsx` (add `leaveRoutes` to children)
- Modify: `apps/web/src/components/shell/TopBar.tsx` (add "Leave" link gated on `leave:request:create:self`)

- [ ] **Step 1: Create the API helpers**

`apps/web/src/modules/leave/api.ts`:

```typescript
import { api } from "@/lib/api"

export type LeaveType = {
  id: string
  code: string
  name: string
  is_paid: boolean
  is_statutory: boolean
}

export type LeaveBalance = {
  id: string
  leave_type: string
  leave_type_code: string
  year: number
  entitled: string
  accrued: string
  taken: string
  pending: string
  carried_forward: string
  available: string
}

export type LeaveRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "withdrawn"

export type LeaveRequest = {
  id: string
  employee_id: string
  leave_type: string
  leave_type_code: string
  start_date: string
  end_date: string
  total_days: string
  is_half_day: boolean
  half_day_period: string
  reason: string
  status: LeaveRequestStatus
  current_level: number
  submitted_at: string | null
  decided_at: string | null
}

async function _get<T>(url: string): Promise<T> {
  const { data, error } = await api.GET(url as never)
  if (error) throw new Error(`GET ${url} failed`)
  return data as T
}

async function _post<T>(url: string, body?: unknown): Promise<T> {
  const { data, error } = await api.POST(url as never, body ? { body: body as never } : undefined)
  if (error) throw new Error(`POST ${url} failed`)
  return data as T
}

export const leaveApi = {
  listTypes: () => _get<{ results?: LeaveType[] } | LeaveType[]>("/api/v1/leave/types/")
    .then((d) => Array.isArray(d) ? d : d.results || []),
  myBalances: () => _get<LeaveBalance[]>("/api/v1/leave/balances/me/"),
  listMyRequests: () => _get<{ results?: LeaveRequest[] } | LeaveRequest[]>("/api/v1/leave/requests/?scope=self")
    .then((d) => Array.isArray(d) ? d : d.results || []),
  listTeamRequests: () => _get<{ results?: LeaveRequest[] } | LeaveRequest[]>("/api/v1/leave/requests/?scope=team")
    .then((d) => Array.isArray(d) ? d : d.results || []),
  apply: (body: {
    leave_type: string
    start_date: string
    end_date: string
    total_days: string
    is_half_day: boolean
    half_day_period?: string
    reason: string
  }) => _post<LeaveRequest>("/api/v1/leave/requests/", body),
  submit: (id: string) => _post<LeaveRequest>(`/api/v1/leave/requests/${id}/submit/`),
  approve: (id: string, comment: string = "") =>
    _post<LeaveRequest>(`/api/v1/leave/requests/${id}/approve/`, { comment }),
  reject: (id: string, comment: string) =>
    _post<LeaveRequest>(`/api/v1/leave/requests/${id}/reject/`, { comment }),
  cancel: (id: string) => _post<LeaveRequest>(`/api/v1/leave/requests/${id}/cancel/`),
  withdraw: (id: string) => _post<LeaveRequest>(`/api/v1/leave/requests/${id}/withdraw/`),
}
```

- [ ] **Step 2: Apply page**

`apps/web/src/modules/leave/pages/LeaveApplyPage.tsx`:

```tsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { leaveApi, type LeaveType } from "../api"

export default function LeaveApplyPage() {
  const navigate = useNavigate()
  const [types, setTypes] = useState<LeaveType[]>([])
  const [leaveType, setLeaveType] = useState<string>("")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [isHalfDay, setIsHalfDay] = useState<boolean>(false)
  const [halfDayPeriod, setHalfDayPeriod] = useState<string>("am")
  const [reason, setReason] = useState<string>("")
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    leaveApi.listTypes().then(setTypes).catch(() => setError("Failed to load leave types"))
  }, [])

  function diffInDays(start: string, end: string): number {
    if (!start || !end) return 0
    const a = new Date(start)
    const b = new Date(end)
    const diff = (b.getTime() - a.getTime()) / 86_400_000 + 1
    return Math.max(0, diff)
  }

  const totalDays = isHalfDay ? 0.5 : diffInDays(startDate, endDate)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await leaveApi.apply({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        total_days: String(totalDays),
        is_half_day: isHalfDay,
        half_day_period: isHalfDay ? halfDayPeriod : "",
        reason,
      })
      // Auto-submit immediately. (Future: separate save-as-draft and submit.)
      await leaveApi.submit(created.id)
      navigate("/leave/me")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Apply for Leave</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Leave type" required>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
            aria-label="Leave type"
          >
            <option value="">Select…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full border rounded px-3 py-2" />
          </Field>
          <Field label="End date" required>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-full border rounded px-3 py-2" />
          </Field>
        </div>

        <Field label="Half day?">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isHalfDay} onChange={(e) => setIsHalfDay(e.target.checked)} />
            Half day
          </label>
          {isHalfDay && (
            <select value={halfDayPeriod} onChange={(e) => setHalfDayPeriod(e.target.value)} className="border rounded px-2 py-1 ml-2">
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          )}
        </Field>

        <Field label="Reason">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full border rounded px-3 py-2" />
        </Field>

        <p className="text-sm text-slate-600">Total days: <strong>{totalDays}</strong></p>

        {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !leaveType || !startDate || !endDate || totalDays <= 0}
          className="bg-slate-900 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Apply"}
        </button>
      </form>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-slate-700 mb-1">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
    </label>
  )
}
```

- [ ] **Step 3: Routes**

`apps/web/src/modules/leave/routes.tsx`:

```tsx
import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const LeaveApplyPage = lazy(() => import("./pages/LeaveApplyPage"))
const MyLeavePage = lazy(() => import("./pages/MyLeavePage"))
const ApprovalsInboxPage = lazy(() => import("./pages/ApprovalsInboxPage"))

export const leaveRoutes: RouteObject[] = [
  { path: "leave/apply", element: <LeaveApplyPage /> },
  { path: "leave/me", element: <MyLeavePage /> },
  { path: "leave/approvals", element: <ApprovalsInboxPage /> },
]
```

(MyLeavePage and ApprovalsInboxPage land in Tasks 2 and 3 — for Task 1 just stub them with a placeholder so the route module typechecks. Or skip routes mounting until Task 3.)

- [ ] **Step 4: Mount routes + topbar nav**

Edit `apps/web/src/App.tsx`. Add `leaveRoutes` import and include in the AppShell route's children (use the same pattern as `employeeRoutes` from M2b, which strips leading slashes).

Edit `apps/web/src/components/shell/TopBar.tsx`. Import `useCan` from `@/lib/perm` and add nav items:

```tsx
import { useCan } from "@/lib/perm"
// ... inside component, before user-email span:
{useCan("leave:request:create:self") && (
  <Link to="/leave/me" className="text-slate-600 hover:text-slate-900">Leave</Link>
)}
{useCan("leave:request:approve:team") && (
  <Link to="/leave/approvals" className="text-slate-600 hover:text-slate-900">Approvals</Link>
)}
```

- [ ] **Step 5: A simple smoke test**

`apps/web/src/modules/leave/pages/LeaveApplyPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { AuthProvider } from "@/lib/auth"

import LeaveApplyPage from "./LeaveApplyPage"

describe("LeaveApplyPage", () => {
  it("renders the apply heading and disabled submit when fields are empty", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
    )

    render(
      <MemoryRouter>
        <AuthProvider>
          <LeaveApplyPage />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(await screen.findByRole("heading", { name: /apply for leave/i })).toBeInTheDocument()
    const submit = screen.getByRole("button", { name: /apply/i })
    expect(submit).toBeDisabled()
  })
})
```

For this Task 1 commit, MyLeavePage and ApprovalsInboxPage need at least placeholder stubs in `pages/` so the lazy imports in `routes.tsx` resolve — make them minimal `export default function() { return <p>TODO</p> }` for now; Tasks 2 and 3 fill them in.

- [ ] **Step 6: Run frontend tests + build**

```
cd apps/web && pnpm test 2>&1 | tail -8 && pnpm build 2>&1 | tail -5; cd ../..
```

- [ ] **Step 7: Commit**

```
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): leave module — apply form + API client + route mounting"
```

---

## Task 2: My Leave page (balances + requests)

**Files:**
- Create / replace: `apps/web/src/modules/leave/pages/MyLeavePage.tsx`

- [ ] **Step 1: Implement the page**

```tsx
import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"

import { leaveApi, type LeaveBalance, type LeaveRequest } from "../api"

export default function MyLeavePage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, r] = await Promise.all([leaveApi.myBalances(), leaveApi.listMyRequests()])
      setBalances(b)
      setRequests(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function onCancel(id: string) {
    try {
      await leaveApi.cancel(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed")
    }
  }

  async function onWithdraw(id: string) {
    try {
      await leaveApi.withdraw(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw failed")
    }
  }

  if (loading) return <p>Loading…</p>
  if (error) return <p role="alert" className="text-red-600">{error}</p>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Leave</h1>
        <Link to="/leave/apply" className="bg-slate-900 text-white py-1.5 px-3 rounded text-sm">Apply for leave</Link>
      </div>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Balances ({balances[0]?.year ?? new Date().getFullYear()})</h2>
        {balances.length === 0 ? (
          <p className="text-slate-500 text-sm">No balances yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1">Type</th><th>Entitled</th><th>Accrued</th><th>Taken</th><th>Pending</th><th>Available</th></tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="py-1.5">{b.leave_type_code}</td>
                  <td>{b.entitled}</td>
                  <td>{b.accrued}</td>
                  <td>{b.taken}</td>
                  <td>{b.pending}</td>
                  <td className="font-semibold">{b.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">My Requests</h2>
        {requests.length === 0 ? (
          <p className="text-slate-500 text-sm">No leave requests yet. <Link to="/leave/apply" className="underline">Apply now</Link>.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1">Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1.5">{r.leave_type_code}</td>
                  <td>{r.start_date} → {r.end_date}</td>
                  <td>{r.total_days}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="space-x-2">
                    {r.status === "submitted" && (
                      <button onClick={() => onWithdraw(r.id)} className="text-amber-700 hover:underline text-xs">Withdraw</button>
                    )}
                    {(r.status === "draft" || r.status === "submitted") && (
                      <button onClick={() => onCancel(r.id)} className="text-red-700 hover:underline text-xs">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    submitted: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-500",
    withdrawn: "bg-amber-100 text-amber-700",
  }
  return <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-slate-100"}`}>{status}</span>
}
```

- [ ] **Step 2: Build + commit**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): MyLeavePage shows balances + requests with cancel/withdraw"
```

---

## Task 3: Approvals inbox + M3 close

**Files:**
- Create / replace: `apps/web/src/modules/leave/pages/ApprovalsInboxPage.tsx`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Implement the inbox**

```tsx
import { useEffect, useState, useCallback } from "react"

import { leaveApi, type LeaveRequest } from "../api"

export default function ApprovalsInboxPage() {
  const [pending, setPending] = useState<LeaveRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState<string>("")
  const [actingOn, setActingOn] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const all = await leaveApi.listTeamRequests()
      setPending(all.filter((r) => r.status === "submitted"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function approve(id: string) {
    try {
      await leaveApi.approve(id, comment)
      setComment("")
      setActingOn(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed")
    }
  }

  async function reject(id: string) {
    if (!comment.trim()) {
      setError("Comment is required to reject")
      return
    }
    try {
      await leaveApi.reject(id, comment)
      setComment("")
      setActingOn(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed")
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">Approvals Inbox</h1>
      {error && <p role="alert" className="text-red-600">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-slate-500">No pending approvals.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li key={r.id} className="bg-white border rounded p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-semibold">{r.leave_type_code} • {r.total_days} day(s)</div>
                  <div className="text-slate-600">{r.start_date} → {r.end_date}</div>
                  {r.reason && <div className="text-slate-500 mt-1">"{r.reason}"</div>}
                </div>
                {actingOn === r.id ? (
                  <div className="space-y-2 ml-3">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Comment (required for reject)"
                      rows={2}
                      className="border rounded px-2 py-1 w-64 text-sm"
                    />
                    <div className="space-x-2">
                      <button onClick={() => approve(r.id)} className="text-xs bg-green-700 text-white px-3 py-1 rounded">Approve</button>
                      <button onClick={() => reject(r.id)} className="text-xs bg-red-700 text-white px-3 py-1 rounded">Reject</button>
                      <button onClick={() => { setActingOn(null); setComment("") }} className="text-xs text-slate-600 underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setActingOn(r.id)}
                    className="text-sm text-slate-700 hover:text-slate-900 border rounded px-3 py-1"
                  >
                    Review
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run frontend tests + build**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
```

- [ ] **Step 3: Commit Task 3 (frontend)**

```
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): ApprovalsInboxPage with approve/reject (comment-required)"
```

- [ ] **Step 4: CHANGELOG**

Edit `CHANGELOG.md`. Add after the M2 block:

```markdown
## [0.1.0-m3] - 2026-04-28

### Added
- **M3a — Workflow engine:** subject-agnostic state machine (`WorkflowEngine`) with `submit/act/cancel/withdraw` transitions and Django signals for `workflow_submitted/_step_approved/_step_rejected/_approved/_rejected/_cancelled/_withdrawn`. Resolvers for direct manager, department head, role, and finance. `ApprovalDelegation` model + `DelegationService`. Effective-approver routing (delegation > leave fallback > original).
- **M3b — Leave data layer:** `LeaveType`, `LeavePolicy`, `LeaveBalance`, `LeaveBalanceLedger` (append-only). `LedgerService` (idempotent on reference), `BalanceService` (accrue/hold/deduct/release/grant_replacement), `PolicyService` (tenure brackets). Seed command `seed_leave_types_from_country` for org-bootstrap from MY country defaults.
- **M3c — Leave requests + approval flow:** `LeaveRequest` + `LeaveApproval` models, `LEAVE_DEFAULT` chain (1-step DirectManager), `LeaveRequestService` adapter wrapping the workflow engine with balance integration, signal handlers that maintain `LeaveApproval` rows. Endpoints `/api/v1/leave/{types,balances,requests}` + action verbs `submit/approve/reject/cancel/withdraw`.
- **M3d — Frontend leave UI:** apply-for-leave form, "My Leave" page with balances + own requests + cancel/withdraw, manager Approvals Inbox with approve/reject (comment required for reject), TopBar nav links permission-gated.
- 14 new permission codes (M3): `leave:request:*`, `leave:balance:*`, `leave:type:write`, `leave:policy:write`, `leave:delegation:write:self`. Catalogue grew from 29 to 43 codes.
```

- [ ] **Step 5: Commit milestone-close + tag**

```
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M3 milestone complete — release 0.1.0-m3"
git tag -a v0.1.0-m3 -m "M3: Workflow engine + Leave (backend + frontend)"
```

- [ ] **Step 6: Merge to master**

```
git checkout master
git merge --ff-only m3/workflow
git branch -d m3/workflow
```

Verify final state:

```
git log --oneline -5
git tag -l "v*"
cd apps/api && uv run pytest -q 2>&1 | tail -5; cd ../..
cd apps/web && pnpm test 2>&1 | tail -5; cd ../..
```

Expected: master at v0.1.0-m3 commit; tags v0.1.0-{m0,m1,m2,m3} all present; backend ~229 tests + frontend ~6 tests, all green.

---

## M3d + M3 Close Acceptance Criteria

- [ ] Apply-for-leave form submits and auto-submits the request
- [ ] My Leave page shows balances and own requests with cancel/withdraw actions
- [ ] Approvals Inbox shows submitted requests for managers; approve/reject (with comment) work
- [ ] Reject with empty comment is rejected client-side
- [ ] Nav links visible only when the relevant permission is held
- [ ] All frontend tests + builds pass; bundle gz under budget
- [ ] `m3/workflow` merged FF to master
- [ ] Tag `v0.1.0-m3` exists on master HEAD
- [ ] All 4 tags (`v0.1.0-m{0,1,2,3}`) present
- [ ] Backend ~229 tests + frontend ~6 tests, all green

That closes M3. Next milestone: **M4 — Schedule + Attendance**.
