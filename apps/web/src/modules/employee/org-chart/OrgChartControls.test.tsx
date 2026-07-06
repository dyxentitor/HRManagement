import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({ orgChartApi: { search: vi.fn().mockResolvedValue([]) } }))

import { OrgChartControls } from "./OrgChartControls"
import { EMPTY_FILTERS } from "./org-chart-filters"

const baseProps = {
  view: "tree" as const,
  onViewChange: vi.fn(),
  filters: EMPTY_FILTERS,
  onFiltersChange: vi.fn(),
  departments: [{ id: "d1", name: "Eng", head_count: 3 }],
  onSearchSelect: vi.fn(),
  zoom: { pct: 100, in: vi.fn(), out: vi.fn(), fit: vi.fn() },
  breadcrumbs: [],
  onCrumb: vi.fn(),
}

describe("OrgChartControls", () => {
  it("switches views", () => {
    const onViewChange = vi.fn()
    render(<OrgChartControls {...baseProps} onViewChange={onViewChange} />)
    fireEvent.click(screen.getByRole("button", { name: /^department$/i }))
    expect(onViewChange).toHaveBeenCalledWith("department")
  })

  it("hides zoom controls in department view", () => {
    const { rerender } = render(<OrgChartControls {...baseProps} view="tree" />)
    expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument()
    rerender(<OrgChartControls {...baseProps} view="department" />)
    expect(screen.queryByLabelText(/zoom in/i)).not.toBeInTheDocument()
  })

  it("emits department filter changes", () => {
    const onFiltersChange = vi.fn()
    render(<OrgChartControls {...baseProps} onFiltersChange={onFiltersChange} />)
    fireEvent.change(screen.getByLabelText(/filter by department/i), { target: { value: "d1" } })
    expect(onFiltersChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, department: "d1" })
  })
})
