import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({
  chain: [
    { id: "10", full_name: "Sam Lee", role_title: "VP", department_name: "Eng", level: 1 },
    { id: "11", full_name: "Jane Doe", role_title: "CEO", department_name: "Exec", level: 2 },
  ],
  focused: {
    id: "5",
    full_name: "Priya N",
    role_title: "Engineer",
    department_id: "d",
    department_name: "Eng",
    status: "active",
    employment_type: "fulltime",
    photo_url: null,
    email: "priya@x.com",
    manager: "10",
  },
  reports: [
    {
      id: "6",
      full_name: "Omar K",
      role_title: "Intern",
      has_reports: false,
      direct_reports_count: 0,
      department_id: "d",
      department_name: "Eng",
      status: "active",
      employment_type: "intern",
      photo_url: null,
      manager: "5",
      manager_name: "Priya N",
      email: null,
    },
  ],
}))

vi.mock("@/lib/perm", () => ({ useCan: () => false }))
vi.mock("@/modules/employee/api", () => ({
  employeeApi: {
    getReportingChain: vi.fn().mockResolvedValue(data.chain),
    retrieve: vi.fn().mockResolvedValue(data.focused),
  },
}))
vi.mock("./api", () => ({
  orgChartApi: { children: vi.fn().mockResolvedValue(data.reports) },
}))

import { ReportingLineView } from "./ReportingLineView"
import { useZoomPan } from "./useZoomPan"

function Harness({ focusId }: { focusId: string | null }) {
  const zoom = useZoomPan()
  return <ReportingLineView focusId={focusId} zoom={zoom} onFocus={() => {}} />
}

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe("ReportingLineView", () => {
  it("prompts to pick someone when no focus", () => {
    wrap(<Harness focusId={null} />)
    expect(screen.getByText(/pick a person/i)).toBeInTheDocument()
  })

  it("renders ancestors, focused person and direct reports", async () => {
    wrap(<Harness focusId="5" />)
    await waitFor(() => expect(screen.getByText("Priya N")).toBeInTheDocument())
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    expect(screen.getByText("Sam Lee")).toBeInTheDocument()
    expect(screen.getByText("Omar K")).toBeInTheDocument()
  })
})
