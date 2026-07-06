import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({
  depts: [{ id: "d1", name: "Engineering", head_count: 1 }],
  members: [
    {
      id: "9",
      full_name: "Sam Lee",
      role_title: "VP",
      has_reports: false,
      direct_reports_count: 0,
      department_id: "d1",
      department_name: "Engineering",
      status: "active",
      employment_type: "fulltime",
      photo_url: null,
      manager: null,
      manager_name: null,
      email: null,
    },
  ],
}))

vi.mock("@/lib/perm", () => ({ useCan: () => false }))
vi.mock("./api", () => ({
  orgChartApi: {
    departments: vi.fn().mockResolvedValue(data.depts),
    departmentMembers: vi.fn().mockResolvedValue(data.members),
  },
}))

import { DepartmentView } from "./DepartmentView"
import { EMPTY_FILTERS } from "./org-chart-filters"

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe("DepartmentView", () => {
  it("expands a department and lazy-loads its members", async () => {
    const user = userEvent.setup()
    wrap(<DepartmentView filters={EMPTY_FILTERS} onFocus={() => {}} />)
    await waitFor(() => expect(screen.getByText("Engineering")).toBeInTheDocument())
    await user.click(screen.getByText("Engineering"))
    await waitFor(() => expect(screen.getByText("Sam Lee")).toBeInTheDocument())
  })
})
