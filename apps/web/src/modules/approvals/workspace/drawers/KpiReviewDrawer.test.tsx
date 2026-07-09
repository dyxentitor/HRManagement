import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ approveItem: vi.fn().mockResolvedValue(undefined) }))
vi.mock("../../api", () => ({ approveItem: mocks.approveItem }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type { InboxItem } from "../../api"
import { KpiReviewDrawer } from "./KpiReviewDrawer"

const kpi: InboxItem = {
  kind: "kpi",
  id: "K1",
  employee_code: "E1",
  summary: "",
  submitted_at: "2026-07-08T00:00:00Z",
  deep_link: "",
  employee_id: "e1",
  name: "Arvind Pillai",
  department: "Operations",
  type_code: "KPI",
  detail: { cycle: "Q2 2026 Performance" },
}

describe("KpiReviewDrawer", () => {
  it("shows a read-only peek with Approve and no Reject", async () => {
    render(<KpiReviewDrawer item={kpi} onClose={() => {}} onActed={() => {}} />)
    expect(screen.getByText("Q2 2026 Performance")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument()
    screen.getByRole("button", { name: /approve review/i }).click()
    await waitFor(() => expect(mocks.approveItem).toHaveBeenCalledWith("kpi", "K1", ""))
  })
})
