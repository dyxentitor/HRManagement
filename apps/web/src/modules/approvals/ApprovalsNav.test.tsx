import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ can: vi.fn((_p: string) => false) }))
vi.mock("@/lib/perm", () => ({ useCan: (p: string) => mocks.can(p) }))

import { ApprovalsNav } from "./ApprovalsNav"
import type { ApprovalsCountKey } from "./approvals-nav-config"

const ZERO: Record<ApprovalsCountKey, number> = {
  all: 0,
  claim: 0,
  leave: 0,
  kpi: 0,
  incentive: 0,
}

function wrap(counts: Record<ApprovalsCountKey, number>, path = "/approvals") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ApprovalsNav counts={counts} />
    </MemoryRouter>,
  )
}

describe("ApprovalsNav", () => {
  it("always shows All Approvals, even with no perms and empty inbox", () => {
    mocks.can.mockReturnValue(false)
    wrap(ZERO)
    expect(screen.getByRole("link", { name: /all approvals/i })).toBeInTheDocument()
  })

  it("shows Leave for a leave approver with no pending items", () => {
    mocks.can.mockImplementation((p: string) => p === "leave:request:approve:team")
    wrap(ZERO)
    expect(screen.getByRole("link", { name: /leave/i })).toBeInTheDocument()
    // Claims hidden: no claim perm, no claim items
    expect(screen.queryByRole("link", { name: /claims/i })).not.toBeInTheDocument()
  })

  it("shows Claims when claim items exist even without the perm", () => {
    mocks.can.mockReturnValue(false)
    wrap({ ...ZERO, claim: 3 })
    const claims = screen.getByRole("link", { name: /claims/i })
    expect(claims).toBeInTheDocument()
    expect(claims).toHaveTextContent("3")
  })

  it("marks the active route", () => {
    mocks.can.mockReturnValue(true)
    wrap({ ...ZERO, claim: 1 }, "/approvals/claims")
    expect(screen.getByRole("link", { name: /claims/i })).toHaveClass("font-semibold")
  })
})
