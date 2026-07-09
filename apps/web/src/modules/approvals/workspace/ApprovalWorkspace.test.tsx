import { fireEvent, render, screen } from "@testing-library/react"
import { Flame } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type { InboxItem } from "../api"
import { isInboxOverdue } from "../lib/inbox-filter"
import type { UseApprovalInbox } from "../useApprovalInbox"
import { ApprovalWorkspace, type WorkspaceDescriptor } from "./ApprovalWorkspace"

const item = (o: Partial<InboxItem>): InboxItem => ({
  kind: "leave",
  id: "x",
  employee_code: "E",
  summary: "",
  submitted_at: "2026-07-08T00:00:00Z",
  deep_link: "",
  employee_id: "e",
  name: "Someone",
  department: "Ops",
  type_code: "ANNUAL",
  detail: { total_days: "2", start_date: "2026-07-20", end_date: "2026-07-21" },
  ...o,
})

function fakeInbox(items: InboxItem[], selected = new Set<string>()): UseApprovalInbox {
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

const descriptor: WorkspaceDescriptor = {
  emptyLabel: "empty",
  lenses: [
    {
      key: "overdue",
      label: "Overdue",
      icon: Flame,
      tone: "coral",
      predicate: (i) => isInboxOverdue(i),
    },
  ],
  sorts: [{ key: "newest", label: "Newest", make: () => (a, b) => a.id.localeCompare(b.id) }],
  DetailDrawer: () => null,
}

describe("ApprovalWorkspace", () => {
  it("filters by search", () => {
    const inbox = fakeInbox([item({ id: "a", name: "Alex" }), item({ id: "b", name: "Bea" })])
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)
    fireEvent.change(screen.getByLabelText("Search approvals"), { target: { value: "alex" } })
    expect(screen.getByText("Alex")).toBeInTheDocument()
    expect(screen.queryByText("Bea")).not.toBeInTheDocument()
  })

  it("Overdue lens narrows to overdue items", () => {
    const inbox = fakeInbox([
      item({ id: "old", name: "OldOne", submitted_at: "2020-01-01T00:00:00Z" }),
      item({ id: "new", name: "FreshOne", submitted_at: new Date().toISOString() }),
    ])
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }))
    expect(screen.getByText("OldOne")).toBeInTheDocument()
    expect(screen.queryByText("FreshOne")).not.toBeInTheDocument()
  })

  it("shows a bulk bar and disables it for a mixed-kind selection (all page)", () => {
    const items = [
      item({ id: "a", kind: "leave" }),
      item({ id: "b", kind: "claim", detail: { amount: "10", currency_code: "MYR" } }),
    ]
    render(
      <ApprovalWorkspace
        inbox={fakeInbox(items, new Set(["a", "b"]))}
        descriptor={{ ...descriptor, typeFilter: true }}
      />,
    )
    expect(screen.getByText(/select one type/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /approve selected/i })).toBeDisabled()
  })
})
