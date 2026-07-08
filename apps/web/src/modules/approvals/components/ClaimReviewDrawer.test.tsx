import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const claim = vi.hoisted(() => ({
  id: "c1",
  employee: "e1",
  employee_name: "Jane Doe",
  employee_code: "EMP-1024",
  employee_department_name: "Engineering",
  employee_role_title: "Senior Engineer",
  employee_manager_name: "Sam Lee",
  category: "cat1",
  category_code: "TRAVEL",
  category_name: "Travel",
  amount: "1250.00",
  currency_code: "MYR",
  expense_date: "2026-06-01",
  description: "Client trip",
  merchant: "Grab",
  business_justification: "Closed the Q3 renewal",
  status: "submitted",
  current_level: 2,
  submitted_at: "2026-06-02T00:00:00Z",
  reimbursed_at: null,
  reimbursement_reference: "",
  approvals: [
    {
      id: 1,
      level: 1,
      approver_id: "m1",
      approver_name: "Sam Lee",
      status: "approved",
      comment: "ok",
      acted_at: "2026-06-03T00:00:00Z",
      delegated_to: null,
    },
  ],
  attachments: [],
}))

const mocks = vi.hoisted(() => ({ approve: vi.fn().mockResolvedValue({}), reject: vi.fn() }))

vi.mock("@/lib/perm", () => ({ useCan: () => false }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/modules/claims/components/ClaimReceipts", () => ({
  ClaimReceipts: () => <div>receipts-stub</div>,
}))
vi.mock("@/modules/admin/audit-api", () => ({
  listAuditLogs: vi.fn().mockResolvedValue({ results: [] }),
}))
vi.mock("@/modules/claims/api", () => ({
  claimsApi: {
    retrieve: vi.fn().mockResolvedValue(claim),
    approve: mocks.approve,
    reject: mocks.reject,
  },
}))

import { ClaimReviewDrawer } from "./ClaimReviewDrawer"

describe("ClaimReviewDrawer", () => {
  it("renders the full review payload", async () => {
    render(<ClaimReviewDrawer claimId="c1" onClose={() => {}} onActed={() => {}} />)
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument())
    expect(screen.getByText(/Engineering/)).toBeInTheDocument()
    expect(screen.getByText(/Manager: Sam Lee/)).toBeInTheDocument()
    expect(screen.getByText("Closed the Q3 renewal")).toBeInTheDocument()
    expect(screen.getByText(/MYR/)).toBeInTheDocument()
    // timeline shows the approver name
    expect(screen.getAllByText("Sam Lee").length).toBeGreaterThanOrEqual(1)
  })

  it("approves via the API", async () => {
    const onActed = vi.fn()
    const user = userEvent.setup()
    render(<ClaimReviewDrawer claimId="c1" onClose={() => {}} onActed={onActed} />)
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /approve/i }))
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith("c1", ""))
    expect(onActed).toHaveBeenCalled()
  })
})
