import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import LegalPage, { LEGAL_DOCS } from "./LegalPage"

describe("LegalPage", () => {
  it.each(Object.keys(LEGAL_DOCS) as (keyof typeof LEGAL_DOCS)[])(
    "renders the %s document with a heading and a back link",
    (doc) => {
      render(
        <MemoryRouter>
          <LegalPage doc={doc} />
        </MemoryRouter>,
      )
      expect(
        screen.getByRole("heading", { level: 1, name: LEGAL_DOCS[doc].title }),
      ).toBeInTheDocument()
      expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
        "href",
        "/login",
      )
    },
  )
})
