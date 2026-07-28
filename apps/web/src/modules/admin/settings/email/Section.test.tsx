import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Section } from "./Section"

describe("Section", () => {
  it("renders the title and children", () => {
    render(
      <Section title="Provider">
        <p>hello</p>
      </Section>,
    )
    expect(screen.getByText("Provider")).toBeInTheDocument()
    expect(screen.getByText("hello")).toBeInTheDocument()
  })
})
