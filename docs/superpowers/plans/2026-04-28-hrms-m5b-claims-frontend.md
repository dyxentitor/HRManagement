# HRMS M5b — Claims Frontend + M5 Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Frontend for claims. Three pages — `ClaimSubmitPage` (employee submits with attachments), `MyClaimsPage` (my list + cancel), `FinanceQueuePage` (finance reimbursement queue). Then close M5: merge to master, tag `v0.1.0-m5`.

**Branch:** `m5/claims` (current).

---

## Task 1: Claims API client + ClaimSubmitPage (with attachment upload)

**Files:**
- Create: `apps/web/src/modules/claims/{api.ts, routes.tsx, pages/ClaimSubmitPage.tsx, pages/MyClaimsPage.tsx (stub), pages/FinanceQueuePage.tsx (stub)}`
- Modify: `apps/web/src/App.tsx` (mount routes)
- Modify: `apps/web/src/components/shell/TopBar.tsx` (add nav)

- [ ] **Step 1: API client**

`apps/web/src/modules/claims/api.ts`:

```typescript
import { api } from "@/lib/api"

export type ClaimCategory = {
  id: string
  code: string
  name: string
  requires_attachment: boolean
  currency_code: string
}

export type ClaimAttachment = {
  id: number
  filename: string
  content_type: string
  size_bytes: number
  s3_key: string
  uploaded_at: string
}

export type ClaimStatus =
  | "draft" | "submitted" | "manager_approved" | "finance_approved"
  | "reimbursed" | "rejected" | "cancelled"

export type ClaimRequest = {
  id: string
  employee: string
  category: string
  category_code: string
  amount: string
  currency_code: string
  expense_date: string
  description: string
  merchant: string
  status: ClaimStatus
  current_level: number
  submitted_at: string | null
  reimbursed_at: string | null
  reimbursement_reference: string
  attachments: ClaimAttachment[]
}

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
async function _delete(url: string): Promise<void> {
  const { error } = await api.DELETE(url as never)
  if (error) throw new Error(`DELETE ${url} failed`)
}

function _unwrap<T>(d: { results?: T[] } | T[]): T[] {
  return Array.isArray(d) ? d : d.results || []
}

export const claimsApi = {
  listCategories: () =>
    _get<{ results?: ClaimCategory[] } | ClaimCategory[]>("/api/v1/claims/categories/").then(_unwrap),
  listMine: () =>
    _get<{ results?: ClaimRequest[] } | ClaimRequest[]>("/api/v1/claims/?scope=self").then(_unwrap),
  listFinanceQueue: () =>
    _get<{ results?: ClaimRequest[] } | ClaimRequest[]>("/api/v1/claims/?scope=finance-queue").then(_unwrap),
  listTeam: () =>
    _get<{ results?: ClaimRequest[] } | ClaimRequest[]>("/api/v1/claims/?scope=team").then(_unwrap),
  retrieve: (id: string) => _get<ClaimRequest>(`/api/v1/claims/${id}/`),
  create: (body: {
    category: string
    amount: string
    currency_code: string
    expense_date: string
    description: string
    merchant?: string
  }) => _post<ClaimRequest>("/api/v1/claims/", body),
  submit: (id: string) => _post<ClaimRequest>(`/api/v1/claims/${id}/submit/`),
  approve: (id: string, comment: string = "") =>
    _post<ClaimRequest>(`/api/v1/claims/${id}/approve/`, { comment }),
  reject: (id: string, comment: string) =>
    _post<ClaimRequest>(`/api/v1/claims/${id}/reject/`, { comment }),
  cancel: (id: string) => _post<ClaimRequest>(`/api/v1/claims/${id}/cancel/`),
  markReimbursed: (id: string, reference: string) =>
    _post<ClaimRequest>(`/api/v1/claims/${id}/mark-reimbursed/`, { reference }),
  presignedUpload: (claimId: string, filename: string, content_type: string) =>
    _post<{ presigned_url: string; s3_key: string; max_size_bytes: number }>(
      `/api/v1/claims/${claimId}/attachments/presigned-upload/`,
      { filename, content_type }
    ),
  registerAttachment: (claimId: string, body: {
    filename: string; content_type: string; size_bytes: number; s3_key: string;
  }) => _post<ClaimAttachment>(`/api/v1/claims/${claimId}/attachments/`, body),
}
```

- [ ] **Step 2: ClaimSubmitPage with file upload**

`apps/web/src/modules/claims/pages/ClaimSubmitPage.tsx`:

```tsx
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { claimsApi, type ClaimCategory } from "../api"

export default function ClaimSubmitPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<ClaimCategory[]>([])
  const [category, setCategory] = useState<string>("")
  const [amount, setAmount] = useState<string>("")
  const [expenseDate, setExpenseDate] = useState<string>("")
  const [merchant, setMerchant] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    claimsApi.listCategories().then(setCategories).catch(() => setError("Failed to load categories"))
  }, [])

  const selectedCat = categories.find((c) => c.id === category)
  const requiresAttachment = selectedCat?.requires_attachment ?? false

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles(Array.from(e.target.files))
  }

  async function uploadFile(claimId: string, f: File): Promise<void> {
    const presigned = await claimsApi.presignedUpload(claimId, f.name, f.type || "application/octet-stream")
    const putResp = await fetch(presigned.presigned_url, {
      method: "PUT",
      headers: { "Content-Type": f.type || "application/octet-stream" },
      body: f,
    })
    if (!putResp.ok) throw new Error(`S3 PUT failed: ${putResp.status}`)
    await claimsApi.registerAttachment(claimId, {
      filename: f.name,
      content_type: f.type || "application/octet-stream",
      size_bytes: f.size,
      s3_key: presigned.s3_key,
    })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const cat = categories.find((c) => c.id === category)
      const created = await claimsApi.create({
        category,
        amount,
        currency_code: cat?.currency_code || "MYR",
        expense_date: expenseDate,
        description,
        merchant: merchant || undefined,
      })
      // Upload attachments (if any) before submit so they're attached when approver looks
      for (const f of files) {
        await uploadFile(created.id, f)
      }
      await claimsApi.submit(created.id)
      navigate("/claims/me")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!category && !!amount && !!expenseDate &&
    (!requiresAttachment || files.length > 0) && !submitting

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold">Submit a Claim</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Category" required>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
            aria-label="Category"
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.requires_attachment ? "(attachment required)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (MYR)" required>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full border rounded px-3 py-2"
            />
          </Field>
          <Field label="Expense date" required>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
              className="w-full border rounded px-3 py-2"
            />
          </Field>
        </div>

        <Field label="Merchant">
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border rounded px-3 py-2"
          />
        </Field>

        <Field label={`Receipts ${requiresAttachment ? "(required)" : "(optional)"}`}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="block text-sm"
          />
          {files.length > 0 && (
            <ul className="mt-2 text-xs text-slate-600">
              {files.map((f) => <li key={f.name}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
            </ul>
          )}
        </Field>

        {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-slate-900 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit claim"}
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

- [ ] **Step 3: Routes + nav stubs**

`apps/web/src/modules/claims/routes.tsx`:

```tsx
import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const ClaimSubmitPage = lazy(() => import("./pages/ClaimSubmitPage"))
const MyClaimsPage = lazy(() => import("./pages/MyClaimsPage"))
const FinanceQueuePage = lazy(() => import("./pages/FinanceQueuePage"))

export const claimsRoutes: RouteObject[] = [
  { path: "claims/submit", element: <ClaimSubmitPage /> },
  { path: "claims/me", element: <MyClaimsPage /> },
  { path: "claims/finance", element: <FinanceQueuePage /> },
]
```

Stub `MyClaimsPage.tsx` and `FinanceQueuePage.tsx` with `export default function() { return <p>TODO</p> }` for now.

Modify `App.tsx` to add `claimsRoutes` (same pattern as employee/leave/schedule).

Modify `TopBar.tsx`:

```tsx
{useCan("claim:create:self") && (
  <Link to="/claims/me" className="text-slate-600 hover:text-slate-900">Claims</Link>
)}
{useCan("claim:reimburse:finance") && (
  <Link to="/claims/finance" className="text-slate-600 hover:text-slate-900">Finance</Link>
)}
```

- [ ] **Step 4: Build + commit**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): claims module — ClaimSubmitPage with presigned-URL upload"
```

---

## Task 2: MyClaimsPage + FinanceQueuePage

**Files:**
- Replace stubs in `apps/web/src/modules/claims/pages/{MyClaimsPage.tsx, FinanceQueuePage.tsx}`

- [ ] **Step 1: MyClaimsPage**

```tsx
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { claimsApi, type ClaimRequest } from "../api"

export default function MyClaimsPage() {
  const [claims, setClaims] = useState<ClaimRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const c = await claimsApi.listMine()
      setClaims(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function onCancel(id: string) {
    try {
      await claimsApi.cancel(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed")
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Claims</h1>
        <Link to="/claims/submit" className="bg-slate-900 text-white py-1.5 px-3 rounded text-sm">Submit a claim</Link>
      </div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {claims.length === 0 ? (
        <p className="text-slate-500">No claims yet. <Link to="/claims/submit" className="underline">Submit one</Link>.</p>
      ) : (
        <table className="w-full text-sm bg-white border rounded">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pl-3">Date</th><th>Category</th><th>Amount</th>
              <th>Status</th><th className="pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 pl-3">{c.expense_date}</td>
                <td>{c.category_code}</td>
                <td className="font-semibold">{c.currency_code} {c.amount}</td>
                <td><StatusBadge status={c.status} /></td>
                <td className="pr-3 space-x-2 text-xs">
                  {(c.status === "draft" || c.status === "submitted") && (
                    <button onClick={() => onCancel(c.id)} className="text-red-700 hover:underline">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    submitted: "bg-blue-100 text-blue-700",
    manager_approved: "bg-indigo-100 text-indigo-700",
    finance_approved: "bg-purple-100 text-purple-700",
    reimbursed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-500",
  }
  return <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-slate-100"}`}>{status.replace("_", " ")}</span>
}
```

- [ ] **Step 2: FinanceQueuePage**

```tsx
import { useCallback, useEffect, useState } from "react"

import { claimsApi, type ClaimRequest } from "../api"

export default function FinanceQueuePage() {
  const [queue, setQueue] = useState<ClaimRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<string>("")
  const [acting, setActing] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setQueue(await claimsApi.listFinanceQueue())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function markReimbursed(id: string) {
    if (!reference.trim()) {
      setError("Reference is required")
      return
    }
    try {
      await claimsApi.markReimbursed(id, reference)
      setReference("")
      setActing(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reimburse failed")
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">Finance Queue</h1>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {queue.length === 0 ? (
        <p className="text-slate-500">No claims awaiting reimbursement.</p>
      ) : (
        <ul className="space-y-2">
          {queue.map((c) => (
            <li key={c.id} className="bg-white border rounded p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-semibold">{c.category_code} • {c.currency_code} {c.amount}</div>
                  <div className="text-slate-600">{c.expense_date} {c.merchant && `• ${c.merchant}`}</div>
                  {c.description && <div className="text-slate-500 mt-1">"{c.description}"</div>}
                </div>
                {acting === c.id ? (
                  <div className="space-y-2 ml-3">
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Bank reference / transaction ID"
                      className="border rounded px-2 py-1 w-64 text-sm"
                    />
                    <div className="space-x-2">
                      <button onClick={() => markReimbursed(c.id)} className="text-xs bg-green-700 text-white px-3 py-1 rounded">Mark reimbursed</button>
                      <button onClick={() => { setActing(null); setReference("") }} className="text-xs text-slate-600 underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setActing(c.id)} className="text-sm border rounded px-3 py-1">Reimburse</button>
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

- [ ] **Step 3: Build + commit**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): MyClaimsPage + FinanceQueuePage"
```

---

## Task 3: M5 close

- [ ] **Step 1: CHANGELOG**

```markdown
## [0.1.0-m5] - 2026-04-28

### Added
- **M5a — Claims backend:** `ClaimCategory`/`ClaimPolicy`/`ClaimRequest`/`ClaimAttachment`/`ClaimApproval` models. Three pre-configured chains keyed by amount band (`CLAIM_UNDER_500`, `CLAIM_500_TO_5000`, `CLAIM_OVER_5000`). `ClaimRequestService` adapter wrapping M3a's `WorkflowEngine`. Signal handlers populate `claim_approvals` rows on workflow events (next-level row staged on multi-step approve). Endpoints `/api/v1/claims/{categories,policies,*}` + action verbs (`submit`, `approve`, `reject`, `cancel`, `mark-reimbursed`). Presigned-URL S3 attachment flow.
- **M5b — Claims frontend:** `ClaimSubmitPage` with multi-file presigned-URL upload before submit. `MyClaimsPage` (list + cancel). `FinanceQueuePage` for finance to mark reimbursed with bank reference. TopBar nav: "Claims" (everyone with `claim:create:self`) + "Finance" (finance role).
- 11 new permission codes (M5): `claim:*`. Catalogue grew from 58 to 69.
```

- [ ] **Step 2: Commit + tag**

```
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M5 milestone complete — release 0.1.0-m5"
git tag -a v0.1.0-m5 -m "M5: Claims (multi-step approval reusing workflow engine)"
```

- [ ] **Step 3: Merge to master**

```
git checkout master
git merge --ff-only m5/claims
git branch -d m5/claims
```

Verify: 6 tags present, all tests green.

---

## M5 Close Acceptance Criteria

- [ ] Employee submits a claim with attachments; small amount → 2-step chain
- [ ] Manager approves via either MyApprovals (M3) or directly through claim → moves to manager_approved
- [ ] Finance approves → finance_approved
- [ ] Finance marks reimbursed with reference → reimbursed
- [ ] My Claims page shows full status history
- [ ] Bundle gz under budget
- [ ] `m5/claims` merged FF; tag `v0.1.0-m5` on master
- [ ] All 6 tags (`v0.1.0-m{0..5}`) present
- [ ] Backend ~293 + frontend ~5+ tests, all green
