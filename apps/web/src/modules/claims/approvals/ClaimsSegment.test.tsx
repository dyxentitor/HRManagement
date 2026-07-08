import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({
  summary: {
    awaiting_count: 1,
    pending_value: "7000.00",
    oldest_days: 12,
    overdue_count: 1,
    high_value_count: 1,
    approved_this_week: 3,
  },
  rows: [
    {
      id: "c1",
      employee_name: "Nurul Izzah",
      employee_role_title: "Consultant",
      employee_code: "E1",
      amount: "7000",
      currency_code: "MYR",
      category_name: "Equipment",
      merchant: "Apple",
      submitted_at: "2026-06-01T00:00:00Z",
      status: "submitted",
      stage_label: "Finance",
      attachments_count: 2,
      is_high_value: true,
      age_days: 12,
      is_overdue: true,
      actionable: true,
    },
  ],
}))

vi.mock("@/lib/perm", () => ({ useCan: () => false }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/modules/approvals/components/ClaimReviewDrawer", () => ({
  ClaimReviewDrawer: ({ claimId }: { claimId: string | null }) =>
    claimId ? <div>drawer:{claimId}</div> : null,
}))
vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>()
  return {
    ...actual,
    claimsApi: {
      ...actual.claimsApi,
      approvalsQueue: vi.fn().mockResolvedValue(data.rows),
      approvalsSummary: vi.fn().mockResolvedValue(data.summary),
      approve: vi.fn().mockResolvedValue({}),
    },
  }
})

import { ClaimsSegment } from "./ClaimsSegment"

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe("ClaimsSegment", () => {
  it("loads summary + queue and opens the preview on row click", async () => {
    const user = userEvent.setup()
    wrap(<ClaimsSegment />)
    await waitFor(() => expect(screen.getByText("Nurul Izzah")).toBeInTheDocument())
    // lens chip carries the overdue count from the summary (band removed)
    expect(screen.getByRole("button", { name: "Overdue" })).toHaveTextContent("1")
    // clicking the row body opens the (mocked) drawer
    await user.click(screen.getByText("Nurul Izzah"))
    await waitFor(() => expect(screen.getByText("drawer:c1")).toBeInTheDocument())
  })
})
