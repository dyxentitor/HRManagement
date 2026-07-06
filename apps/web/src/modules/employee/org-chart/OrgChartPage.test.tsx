import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  orgChartApi: {
    departments: vi.fn().mockResolvedValue([]),
    roots: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock("./TreeView", () => ({ TreeView: () => <div>TREE</div> }))
vi.mock("./DepartmentView", () => ({ DepartmentView: () => <div>DEPARTMENT</div> }))
vi.mock("./ReportingLineView", () => ({ ReportingLineView: () => <div>REPORTING</div> }))

import OrgChartPage from "./OrgChartPage"

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe("OrgChartPage", () => {
  it("shows the tree view by default and switches to department", async () => {
    const user = userEvent.setup()
    wrap(<OrgChartPage />)
    expect(screen.getByText("Organization Chart")).toBeInTheDocument()
    expect(screen.getByText("TREE")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^department$/i }))
    expect(screen.getByText("DEPARTMENT")).toBeInTheDocument()
  })
})
