import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  coverage: vi.fn().mockResolvedValue({ per_day: {}, people: [] }),
  can: vi.fn((_p: string) => true),
}))
vi.mock("./api", () => ({
  getInbox: mocks.getInbox,
  approveItem: vi.fn(),
  rejectItem: vi.fn(),
}))
vi.mock("@/modules/leave/api", () => ({ leaveApi: { coverage: mocks.coverage } }))
vi.mock("@/lib/perm", () => ({ useCan: (p: string) => mocks.can(p) }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }))
vi.mock("./components/ClaimReviewDrawer", () => ({ ClaimReviewDrawer: () => null }))
// Claims segment is heavy + self-fetches — stub it.
vi.mock("@/modules/claims/approvals/ClaimsSegment", () => ({
  ClaimsSegment: () => <div>claims-segment</div>,
}))

const claim = {
  kind: "claim",
  id: "c1",
  employee_code: "E1",
  summary: "",
  submitted_at: null,
  deep_link: "",
  employee_id: "e1",
  name: "Alex Tan",
  department: "Ops",
  type_code: "TRAVEL",
  detail: { amount: "100", currency_code: "MYR", expense_date: "2026-06-01", attachments: [] },
}

import ApprovalCenterPage from "./ApprovalCenterPage"

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe("ApprovalCenterPage", () => {
  it("shows the rail and switches to the Claims segment", async () => {
    mocks.can.mockReturnValue(true)
    mocks.getInbox.mockResolvedValue([claim])
    const user = userEvent.setup()
    wrap(<ApprovalCenterPage />)
    // default = All segment (renders the claim card)
    await waitFor(() => expect(screen.getByText("Alex Tan")).toBeInTheDocument())
    // rail has Claims tab
    await user.click(screen.getByRole("button", { name: /^claims/i }))
    await waitFor(() => expect(screen.getByText("claims-segment")).toBeInTheDocument())
  })

  it("shows the Leave tab for a leave approver even with no pending leave", async () => {
    // Only the real leave-approval perm is granted; the inbox has no leave items.
    mocks.can.mockImplementation((p: string) => p === "leave:request:approve:team")
    mocks.getInbox.mockResolvedValue([])
    wrap(<ApprovalCenterPage />)
    await waitFor(() => expect(screen.getByRole("button", { name: /^leave/i })).toBeInTheDocument())
    // Claims tab is NOT shown (no claim perm, no claim items)
    expect(screen.queryByRole("button", { name: /^claims/i })).not.toBeInTheDocument()
  })
})
