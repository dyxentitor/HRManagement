import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { AuthProvider } from "@/lib/auth"

vi.mock("@/modules/employee/api", () => ({
  employeeApi: {
    getMe: vi.fn().mockResolvedValue({ id: "emp-1", full_name: "Test User" }),
    list: vi.fn().mockResolvedValue([]),
  },
}))

import LeaveApplyPage from "./LeaveApplyPage"

function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <LeaveApplyPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe("LeaveApplyPage (A2)", () => {
  it("renders the heading, type picker, and a disabled submit when empty", async () => {
    const leaveModule = await import("../api")
    vi.spyOn(leaveModule.leaveApi, "listTypes").mockResolvedValue([
      { id: "lt-1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: false },
    ])
    vi.spyOn(leaveModule.leaveApi, "myBalances").mockResolvedValue([])
    vi.spyOn(leaveModule.leaveApi, "holidays").mockResolvedValue([])

    renderPage()
    expect(await screen.findByRole("heading", { name: /apply for leave/i })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /submit request/i })).toBeDisabled(),
    )
    expect(screen.getByText(/Request summary/i)).toBeInTheDocument()
  })

  it("prefills the date range from ?start= on a schedule deep link", async () => {
    const leaveModule = await import("../api")
    vi.spyOn(leaveModule.leaveApi, "listTypes").mockResolvedValue([
      { id: "lt-1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: false },
    ])
    vi.spyOn(leaveModule.leaveApi, "myBalances").mockResolvedValue([])
    vi.spyOn(leaveModule.leaveApi, "holidays").mockResolvedValue([])
    vi.spyOn(leaveModule.leaveApi, "coverage").mockResolvedValue({
      team_size: 0,
      per_day: {},
      people: [],
    })

    render(
      <MemoryRouter initialEntries={["/leave/apply?start=2026-08-26"]}>
        <AuthProvider>
          <LeaveApplyPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    // The page has no labelled date <input>s — the range is picked on a
    // custom calendar grid. The observable prefill is the "Request
    // summary" panel, which only shows the formatted range once both
    // range.start and range.end are non-empty (otherwise it shows the
    // "Pick your dates" placeholder).
    expect(await screen.findByText("26 Aug 2026")).toBeInTheDocument()
    expect(screen.queryByText("Pick your dates")).not.toBeInTheDocument()
  })

  it("ignores a malformed ?start= and falls back to an empty range", async () => {
    const leaveModule = await import("../api")
    vi.spyOn(leaveModule.leaveApi, "listTypes").mockResolvedValue([
      { id: "lt-1", code: "ANNUAL", name: "Annual", is_paid: true, is_statutory: false },
    ])
    vi.spyOn(leaveModule.leaveApi, "myBalances").mockResolvedValue([])
    vi.spyOn(leaveModule.leaveApi, "holidays").mockResolvedValue([])

    render(
      <MemoryRouter initialEntries={["/leave/apply?start=2026-13-45"]}>
        <AuthProvider>
          <LeaveApplyPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await screen.findByRole("heading", { name: /apply for leave/i })
    expect(await screen.findByText("Pick your dates")).toBeInTheDocument()
  })
})
