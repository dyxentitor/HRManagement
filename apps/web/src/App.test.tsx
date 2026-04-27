import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { App } from "./App"

describe("App", () => {
  it("renders the HRMS heading", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: /HRMS/i })).toBeInTheDocument()
  })

  it("shows the milestone label", () => {
    render(<App />)
    expect(screen.getByText(/M0 — Repo Scaffold/i)).toBeInTheDocument()
  })
})
