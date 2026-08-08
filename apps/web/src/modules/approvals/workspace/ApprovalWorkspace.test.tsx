import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
    selectMany: vi.fn(),
    deselectMany: vi.fn(),
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

  // --- prod feedback de9b6645 "Request Select All and Approve" ---

  it("select-all picks every row matching the current filters in one click", () => {
    const inbox = fakeInbox([item({ id: "a" }), item({ id: "b" }), item({ id: "c" })])
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)

    fireEvent.click(screen.getByRole("checkbox", { name: /select all 3/i }))
    expect(inbox.selectMany).toHaveBeenCalledWith(["a", "b", "c"])
  })

  it("select-all respects the active search filter", () => {
    const inbox = fakeInbox([item({ id: "a", name: "Alex" }), item({ id: "b", name: "Bea" })])
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)
    fireEvent.change(screen.getByLabelText("Search approvals"), { target: { value: "alex" } })

    fireEvent.click(screen.getByRole("checkbox", { name: /select all 1/i }))
    expect(inbox.selectMany).toHaveBeenCalledWith(["a"])
  })

  it("select-all skips non-actionable history rows", () => {
    const inbox = fakeInbox([
      item({ id: "a", actionable: true } as never),
      item({ id: "done", actionable: false } as never),
    ])
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)

    fireEvent.click(screen.getByRole("checkbox", { name: /select all 1/i }))
    expect(inbox.selectMany).toHaveBeenCalledWith(["a"])
  })

  it("toggles back to deselect when everything is already selected", () => {
    const inbox = fakeInbox([item({ id: "a" }), item({ id: "b" })], new Set(["a", "b"]))
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)

    const box = screen.getByRole("checkbox", { name: /deselect all 2/i }) as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(inbox.deselectMany).toHaveBeenCalledWith(["a", "b"])
  })

  it("shows an indeterminate box on a partial selection", () => {
    const inbox = fakeInbox([item({ id: "a" }), item({ id: "b" })], new Set(["a"]))
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)

    const box = screen.getByRole("checkbox", { name: /select all 2/i }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(box.indeterminate).toBe(true)
  })

  it("select-all then bulk-approve sends every selected id", () => {
    const inbox = fakeInbox([item({ id: "a" }), item({ id: "b" })], new Set(["a", "b"]))
    render(<ApprovalWorkspace inbox={inbox} filterKind="leave" descriptor={descriptor} />)

    fireEvent.click(screen.getByRole("button", { name: /approve selected/i }))
    expect(inbox.approveIds).toHaveBeenCalledWith(["a", "b"])
  })

  it("queue mode renders tabs, fetches on switch, hides action on history rows", async () => {
    const fetchTab = vi.fn(async (t: string) =>
      t === "approved"
        ? [item({ id: "h", name: "HistoryRow", actionable: false, status: "approved" } as never)]
        : [item({ id: "a", name: "AwaitRow", actionable: true } as never)],
    )
    const fetchSummary = vi.fn(async () => ({ awaiting_count: 1, overdue_count: 0 }))
    const qDesc: WorkspaceDescriptor = {
      ...descriptor,
      queue: {
        tabs: [
          { key: "awaiting", label: "Awaiting" },
          { key: "approved", label: "Approved" },
        ],
        fetchTab,
        fetchSummary,
        lensCount: (s, k) => s[`${k}_count`] ?? 0,
      },
    }
    render(<ApprovalWorkspace descriptor={qDesc} />)
    // awaiting tab loads + row has an Approve action
    await waitFor(() => expect(screen.getByText("AwaitRow")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument()
    // switch to Approved → fetchTab("approved"), history row has no action
    fireEvent.click(screen.getByRole("button", { name: /^approved$/i }))
    await waitFor(() => expect(screen.getByText("HistoryRow")).toBeInTheDocument())
    expect(fetchTab).toHaveBeenCalledWith("approved")
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument()
  })
})
