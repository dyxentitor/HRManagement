import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/perm", () => ({ useCan: (p: string) => p === "assignment:create:org" }))

import { OrgNodeCard } from "./OrgNodeCard"
import type { OrgNode } from "./types"

const node: OrgNode = {
  id: "1",
  full_name: "Jane Doe",
  email: "jane@x.com",
  role_title: "CEO",
  department_name: "Exec",
  department_id: "d1",
  status: "active",
  employment_type: "fulltime",
  direct_reports_count: 3,
  has_reports: true,
  photo_url: null,
  manager: null,
  manager_name: null,
  hire_date: null,
}

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe("OrgNodeCard", () => {
  it("renders identity, department and reports count", () => {
    wrap(<OrgNodeCard node={node} />)
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    expect(screen.getByText("CEO")).toBeInTheDocument()
    expect(screen.getByText("Exec")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("shows Assign task when the perm is present, plus View profile + Email", async () => {
    const user = userEvent.setup()
    wrap(<OrgNodeCard node={node} />)
    await user.click(screen.getByLabelText(/actions for jane doe/i))
    expect(screen.getByRole("menuitem", { name: /view profile/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /assign task/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /email/i })).toBeInTheDocument()
  })

  it("omits the Email action when there is no address", async () => {
    const user = userEvent.setup()
    wrap(<OrgNodeCard node={{ ...node, email: null }} />)
    await user.click(screen.getByLabelText(/actions for jane doe/i))
    expect(screen.getByRole("menuitem", { name: /view profile/i })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /email/i })).not.toBeInTheDocument()
  })

  it("fires onToggle from the expand control", () => {
    const onToggle = vi.fn()
    wrap(<OrgNodeCard node={node} onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText(/expand jane doe/i))
    expect(onToggle).toHaveBeenCalledWith("1")
  })

  it("renders tenure in the Executive footer", () => {
    wrap(<OrgNodeCard node={{ ...node, hire_date: "2020-01-01" }} />)
    expect(screen.getByText(/\d+y \d+m/)).toBeInTheDocument()
  })

  it("compact density still renders identity + reports count", () => {
    wrap(<OrgNodeCard node={node} density="compact" />)
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})
