import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  approveItem: vi.fn().mockResolvedValue(undefined),
  rejectItem: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../api", () => ({ approveItem: mocks.approveItem, rejectItem: mocks.rejectItem }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type { InboxItem } from "../../api"
import { IncentiveReviewDrawer } from "./IncentiveReviewDrawer"

const claim: InboxItem = {
  kind: "incentive",
  id: "C1",
  employee_code: "E1",
  summary: "",
  submitted_at: "2026-07-08T00:00:00Z",
  deep_link: "",
  employee_id: "e1",
  name: "Nurul Huda",
  department: "Delivery",
  type_code: "MANDAY",
  detail: { mandays: "3.00", project: "Rollout", customer: "Acme", note: "Onsite work" },
}

describe("IncentiveReviewDrawer", () => {
  it("renders the claim detail and approves via the incentive endpoint", async () => {
    render(<IncentiveReviewDrawer item={claim} onClose={() => {}} onActed={() => {}} />)
    expect(screen.getByText("Rollout")).toBeInTheDocument()
    expect(screen.getByText("Acme")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /approve/i }))
    await waitFor(() => expect(mocks.approveItem).toHaveBeenCalledWith("incentive", "C1", ""))
  })

  it("requires a reason before rejecting", async () => {
    const { toast } = await import("sonner")
    render(<IncentiveReviewDrawer item={claim} onClose={() => {}} onActed={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: /reject/i }))
    expect(mocks.rejectItem).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText(/review reason/i), "over budget")
    await userEvent.click(screen.getByRole("button", { name: /reject/i }))
    await waitFor(() =>
      expect(mocks.rejectItem).toHaveBeenCalledWith("incentive", "C1", "over budget"),
    )
  })
})
