import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, test } from "vitest"

import HelpHomePage from "./pages/HelpHomePage"

test("filters articles as you type in the search box", () => {
  render(
    <MemoryRouter>
      <HelpHomePage />
    </MemoryRouter>,
  )
  expect(screen.getByText("Applying for leave")).toBeInTheDocument()
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "smtp" } })
  expect(screen.getByText(/test email failed/i)).toBeInTheDocument()
  expect(screen.queryByText("Applying for leave")).toBeNull()
})
