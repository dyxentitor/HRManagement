import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ClampText, TruncTip } from "./overflow"

describe("overflow primitives", () => {
  it("ClampText renders the text", () => {
    render(<ClampText text="A long description that could be clamped" />)
    expect(screen.getByText(/long description/)).toBeInTheDocument()
  })

  it("TruncTip renders the value (tooltip trigger)", () => {
    render(
      <TooltipProvider>
        <TruncTip text="verylongunbroken@example.com" />
      </TooltipProvider>,
    )
    expect(screen.getByText("verylongunbroken@example.com")).toBeInTheDocument()
  })
})
