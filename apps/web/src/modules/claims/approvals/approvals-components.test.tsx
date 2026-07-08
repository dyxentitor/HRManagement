import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { ApprovalSummary, ClaimApprovalRow as Row } from "../api"

const mocks = vi.hoisted(() => ({ approve: vi.fn().mockResolvedValue({}) }))
vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>()
  return { ...actual, claimsApi: { ...actual.claimsApi, approve: mocks.approve } }
})
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ApprovalToolbar } from "./ApprovalToolbar"
import { BulkApproveBar } from "./BulkApproveBar"
import { ClaimApprovalRow } from "./ClaimApprovalRow"
import { EMPTY_APPROVAL_FILTERS } from "./approvals-filter"

const wrap = (ui: ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)

const summary: ApprovalSummary = {
  awaiting_count: 6,
  pending_value: "25542.87",
  oldest_days: 8,
  overdue_count: 2,
  high_value_count: 2,
  approved_this_week: 14,
}

const row = (o: Partial<Row> = {}): Row => ({
  id: "c1",
  employee_name: "Nurul Izzah binti Abdullah",
  employee_role_title: "Senior Consultant",
  employee_code: "E1",
  amount: "7000",
  currency_code: "MYR",
  category_name: "Equipment",
  merchant: "Very-Long-Merchant-Sdn-Bhd",
  submitted_at: "2026-06-01T00:00:00Z",
  status: "submitted",
  stage_label: "Finance",
  attachments_count: 5,
  is_high_value: true,
  age_days: 12,
  is_overdue: true,
  actionable: true,
  ...o,
})

describe("approvals components", () => {
  it("toolbar Overdue lens toggles the overdue filter", () => {
    const onFilters = vi.fn()
    wrap(
      <ApprovalToolbar
        tab="awaiting"
        onTab={() => {}}
        search=""
        onSearch={() => {}}
        sort="urgency"
        onSort={() => {}}
        filters={EMPTY_APPROVAL_FILTERS}
        onFilters={onFilters}
        categories={[]}
        awaitingCount={summary.awaiting_count}
        overdueCount={summary.overdue_count}
        highValueCount={summary.high_value_count}
      />,
    )
    // the lens chip carries the overdue count
    const overdue = screen.getByRole("button", { name: "Overdue" })
    expect(overdue).toHaveTextContent("2")
    fireEvent.click(overdue)
    expect(onFilters).toHaveBeenCalledWith(expect.objectContaining({ overdueOnly: true }))
  })

  it("row renders identity + amount and fires approve", () => {
    const onApprove = vi.fn()
    wrap(
      <ClaimApprovalRow
        row={row()}
        selected={false}
        onToggleSelect={() => {}}
        onOpen={() => {}}
        onApprove={onApprove}
      />,
    )
    expect(screen.getByText("Nurul Izzah binti Abdullah")).toBeInTheDocument()
    expect(screen.getByText(/MYR 7,000/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }))
    expect(onApprove).toHaveBeenCalled()
  })

  it("bulk bar approves selected via the API", async () => {
    const onDone = vi.fn()
    wrap(
      <BulkApproveBar
        selected={[row({ id: "a" }), row({ id: "b" })]}
        onClear={() => {}}
        onDone={onDone}
      />,
    )
    const bulkApprove = screen.getByRole("button", { name: /approve 2/i })
    expect(bulkApprove).toBeInTheDocument()
    fireEvent.click(bulkApprove)
    // confirm dialog
    const confirmBtn = await screen.findByRole("button", { name: /^approve$/i })
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledTimes(2))
    expect(onDone).toHaveBeenCalled()
  })
})
