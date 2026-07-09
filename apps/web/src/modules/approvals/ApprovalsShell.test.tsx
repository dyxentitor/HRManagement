import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  coverage: vi.fn().mockResolvedValue({ per_day: {}, people: [] }),
}))
vi.mock("./api", () => ({ getInbox: mocks.getInbox, approveItem: vi.fn(), rejectItem: vi.fn() }))
vi.mock("@/modules/leave/api", () => ({ leaveApi: { coverage: mocks.coverage } }))
vi.mock("@/lib/perm", () => ({ useCan: () => true }))

import ApprovalsShell, { useApprovalsInbox } from "./ApprovalsShell"

function Probe() {
  const inbox = useApprovalsInbox()
  return <div>index-child · {inbox.items.length} items</div>
}

describe("ApprovalsShell", () => {
  it("renders the nav and an index child that reads the inbox context", async () => {
    mocks.getInbox.mockResolvedValue([])
    const { container } = render(
      <MemoryRouter initialEntries={["/approvals"]}>
        <Routes>
          <Route path="/approvals" element={<ApprovalsShell />}>
            <Route index element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: "Approvals" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/index-child/)).toBeInTheDocument())
    // AppShell owns the sole <main> landmark; the shell must not add a second one.
    expect(container.querySelector("main")).toBeNull()
  })
})
