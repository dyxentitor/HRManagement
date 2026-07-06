import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({ orgChartApi: { search: vi.fn().mockResolvedValue([]) } }))

import { OrgChartControls } from "./OrgChartControls"
import { EMPTY_FILTERS } from "./org-chart-filters"

const baseProps = {
  view: "tree" as const,
  onViewChange: vi.fn(),
  filters: EMPTY_FILTERS,
  onFiltersChange: vi.fn(),
  departments: [{ id: "d1", name: "Engineering", head_count: 3 }],
  onSearchSelect: vi.fn(),
  headcount: { people: 148, departments: 12 },
  density: "comfortable" as const,
  onDensityChange: vi.fn(),
  showLevels: false,
  onToggleLevels: vi.fn(),
  breadcrumbs: [],
  onCrumb: vi.fn(),
}

describe("OrgChartControls", () => {
  it("switches views via the icon segmented control", () => {
    const onViewChange = vi.fn()
    render(<OrgChartControls {...baseProps} onViewChange={onViewChange} />)
    fireEvent.click(screen.getByRole("button", { name: /^department$/i }))
    expect(onViewChange).toHaveBeenCalledWith("department")
  })

  it("opens the filter popover and toggles a department chip", async () => {
    const user = userEvent.setup()
    const onFiltersChange = vi.fn()
    render(<OrgChartControls {...baseProps} onFiltersChange={onFiltersChange} />)
    await user.click(screen.getByRole("button", { name: /^filters$/i }))
    await user.click(screen.getByRole("button", { name: /^engineering$/i }))
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ department: "d1" }))
  })

  it("shows the headcount summary", () => {
    render(<OrgChartControls {...baseProps} />)
    expect(screen.getByText(/148 people/i)).toBeInTheDocument()
    expect(screen.getByText(/12 departments/i)).toBeInTheDocument()
  })

  it("emits density changes", () => {
    const onDensityChange = vi.fn()
    render(<OrgChartControls {...baseProps} onDensityChange={onDensityChange} />)
    fireEvent.click(screen.getByRole("button", { name: /^compact$/i }))
    expect(onDensityChange).toHaveBeenCalledWith("compact")
  })
})
