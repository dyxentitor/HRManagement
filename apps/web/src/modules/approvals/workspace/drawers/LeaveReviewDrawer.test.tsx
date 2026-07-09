import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  approveItem: vi.fn().mockResolvedValue(undefined),
  coverage: vi.fn(),
  balancesFor: vi.fn(),
}))
vi.mock("../../api", () => ({ approveItem: mocks.approveItem, rejectItem: vi.fn() }))
vi.mock("@/modules/leave/api", () => ({
  leaveApi: { coverage: mocks.coverage, balancesFor: mocks.balancesFor },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type { InboxItem } from "../../api"
import { LeaveReviewDrawer } from "./LeaveReviewDrawer"

const leave: InboxItem = {
  kind: "leave",
  id: "L1",
  employee_code: "E1",
  summary: "",
  submitted_at: "2026-07-08T00:00:00Z",
  deep_link: "",
  employee_id: "e1",
  name: "Nur Hidayah",
  department: "Operations",
  type_code: "ANNUAL",
  detail: {
    total_days: "3",
    start_date: "2026-07-20",
    end_date: "2026-07-22",
    reason: "Family trip",
  },
}

describe("LeaveReviewDrawer", () => {
  it("shows the request, coverage people, and approves", async () => {
    mocks.coverage.mockResolvedValue({
      team_size: 5,
      per_day: {},
      people: [
        {
          employee_id: "e2",
          name: "Bea Lim",
          leave_type_code: "ANNUAL",
          start: "2026-07-20",
          end: "2026-07-21",
          status: "approved",
        },
      ],
    })
    mocks.balancesFor.mockResolvedValue([
      { leave_type_code: "ANNUAL", available: "8", pending: "1", entitled: "12" },
    ])
    render(<LeaveReviewDrawer item={leave} onClose={() => {}} onActed={() => {}} />)

    expect(screen.getByText("Family trip")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Bea Lim")).toBeInTheDocument())

    screen.getByRole("button", { name: /^approve$/i }).click()
    await waitFor(() => expect(mocks.approveItem).toHaveBeenCalledWith("leave", "L1", ""))
  })
})
