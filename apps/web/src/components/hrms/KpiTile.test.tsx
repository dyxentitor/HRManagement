import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { KpiTile } from "./KpiTile"

describe("KpiTile", () => {
  it("renders label and value", () => {
    render(<KpiTile tone="mint" label="Attendance" value="98%" />)
    expect(screen.getByText("Attendance")).toBeInTheDocument()
    expect(screen.getByText("98%")).toBeInTheDocument()
  })

  it("renders supporting text when given", () => {
    render(<KpiTile tone="peach" label="Annual leave" value="14 d" support="August 2026" />)
    expect(screen.getByText("August 2026")).toBeInTheDocument()
  })

  it("reserves the supporting line even when empty, so a row stays aligned", () => {
    const { container } = render(<KpiTile tone="sky" label="Days off" value="10" />)
    // Three stacked slots — label, value, support — regardless of `support`.
    expect(container.querySelectorAll("p")).toHaveLength(3)
  })

  it("renders a semantic icon rather than repeating the value", () => {
    const { container } = render(
      <KpiTile tone="yellow" label="Open KPIs" value="3" icon={<svg data-testid="kpi-icon" />} />,
    )
    // The value appears exactly once — the icon slot carries a glyph, not
    // "3" over again, which is what the old solid-disc tile did.
    expect(screen.getAllByText("3")).toHaveLength(1)
    expect(screen.getByTestId("kpi-icon")).toBeInTheDocument()
    // Decorative: hidden from assistive tech, since the label already names it.
    expect(container.querySelector("[aria-hidden]")).toContainElement(
      screen.getByTestId("kpi-icon"),
    )
  })
})
