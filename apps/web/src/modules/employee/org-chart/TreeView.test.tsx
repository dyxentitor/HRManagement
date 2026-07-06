import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({
  roots: [
    {
      id: "1",
      full_name: "Jane Doe",
      role_title: "CEO",
      has_reports: true,
      direct_reports_count: 1,
      department_id: "d",
      department_name: "Exec",
      status: "active",
      employment_type: "fulltime",
      photo_url: null,
      manager: null,
      manager_name: null,
      email: null,
    },
  ],
  kids: [
    {
      id: "2",
      full_name: "Sam Lee",
      role_title: "VP",
      has_reports: false,
      direct_reports_count: 0,
      department_id: "d",
      department_name: "Eng",
      status: "active",
      employment_type: "fulltime",
      photo_url: null,
      manager: "1",
      manager_name: "Jane Doe",
      email: null,
    },
  ],
}))

vi.mock("@/lib/perm", () => ({ useCan: () => false }))
vi.mock("./api", () => ({
  orgChartApi: {
    roots: vi.fn().mockResolvedValue(data.roots),
    children: vi.fn().mockResolvedValue(data.kids),
  },
}))

import { TreeView } from "./TreeView"
import { EMPTY_FILTERS } from "./org-chart-filters"
import { useZoomPan } from "./useZoomPan"

function Harness({ highlightId }: { highlightId?: string | null }) {
  const zoom = useZoomPan()
  return (
    <TreeView filters={EMPTY_FILTERS} zoom={zoom} onFocus={() => {}} highlightId={highlightId} />
  )
}

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe("TreeView", () => {
  it("renders roots then lazy-loads children on expand", async () => {
    const user = userEvent.setup()
    wrap(<Harness />)
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument())
    await user.click(screen.getByLabelText(/expand jane doe/i))
    await waitFor(() => expect(screen.getByText("Sam Lee")).toBeInTheDocument())
  })
})
