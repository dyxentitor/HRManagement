import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/perm", () => ({ useCan: () => false }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }))
vi.mock("../components/ClaimReviewDrawer", () => ({ ClaimReviewDrawer: () => null }))

import type { InboxItem } from "../api"
import type { UseApprovalInbox } from "../useApprovalInbox"
import { InboxCardList } from "./InboxCardList"

const item = (over: Partial<InboxItem>): InboxItem => ({
  kind: "claim",
  id: "1",
  employee_code: "E1",
  summary: "",
  submitted_at: null,
  deep_link: "",
  employee_id: "e1",
  name: "Alex Tan",
  department: "Ops",
  type_code: "TRAVEL",
  detail: { amount: "100", currency_code: "MYR", expense_date: "2026-06-01", attachments: [] },
  ...over,
})

function makeInbox(selected: Set<string>, items: InboxItem[]): UseApprovalInbox {
  return {
    items,
    clashes: new Map(),
    selected,
    loading: false,
    error: null,
    refresh: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    approveIds: vi.fn(),
    toggle: vi.fn(),
    clearSelection: vi.fn(),
  } as unknown as UseApprovalInbox
}

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe("InboxCardList", () => {
  it("renders mixed items", () => {
    const inbox = makeInbox(new Set(), [
      item({ id: "a", kind: "claim", name: "Alex Tan" }),
      item({
        id: "b",
        kind: "leave",
        name: "Bea Lim",
        detail: { total_days: "2", start_date: "2026-06-01", end_date: "2026-06-02" },
      }),
    ])
    wrap(<InboxCardList inbox={inbox} onChanged={() => {}} emptyLabel="empty" />)
    expect(screen.getByText("Alex Tan")).toBeInTheDocument()
    expect(screen.getByText("Bea Lim")).toBeInTheDocument()
  })

  it("disables bulk-approve for a mixed-kind selection, enables for one kind", () => {
    const items = [
      item({ id: "a", kind: "claim" }),
      item({
        id: "b",
        kind: "leave",
        detail: { total_days: "1", start_date: "2026-06-01", end_date: "2026-06-01" },
      }),
    ]
    // mixed selection → disabled
    const { unmount } = wrap(
      <InboxCardList
        inbox={makeInbox(new Set(["a", "b"]), items)}
        onChanged={() => {}}
        emptyLabel="e"
      />,
    )
    expect(screen.getByText(/select one type/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /approve selected/i })).toBeDisabled()
    unmount()
    // single-kind selection → enabled
    wrap(
      <InboxCardList
        inbox={makeInbox(new Set(["a"]), items)}
        onChanged={() => {}}
        emptyLabel="e"
      />,
    )
    expect(screen.getByRole("button", { name: /approve selected/i })).not.toBeDisabled()
  })
})
