import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import type { InboxItem } from "../api"
import { ApprovalRow } from "./ApprovalRow"

const draw = (ui: ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)

const base: InboxItem = {
  kind: "leave",
  id: "1",
  employee_code: "E1",
  summary: "",
  submitted_at: "2026-07-08T00:00:00Z",
  deep_link: "",
  employee_id: "e1",
  name: "Nur Hidayah",
  department: "Operations",
  type_code: "ANNUAL",
  detail: { total_days: "3", start_date: "2026-07-20", end_date: "2026-07-22" },
}
const item = (o: Partial<InboxItem> = {}): InboxItem => ({ ...base, ...o })

const props = {
  selected: false,
  onToggleSelect: () => {},
  onOpen: vi.fn(),
  onApprove: vi.fn(),
}

describe("ApprovalRow", () => {
  it("leave row shows days focal + coverage clash and an Approve button", () => {
    draw(
      <ApprovalRow item={item()} clash={{ count: 2, names: ["Bea"] }} variant="typed" {...props} />,
    )
    expect(screen.getByText("3 days")).toBeInTheDocument()
    expect(screen.getByText(/2 off/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument()
  })

  it("kpi row is Review-first with no Reject action", () => {
    draw(
      <ApprovalRow
        item={item({ kind: "kpi", detail: { cycle: "Q2 2026" } })}
        variant="typed"
        {...props}
      />,
    )
    expect(screen.getByRole("button", { name: /^review$/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument()
  })

  it("all variant shows a type tag", () => {
    draw(
      <ApprovalRow
        item={item({
          kind: "claim",
          detail: { amount: "500", currency_code: "MYR", merchant: "Grab" },
        })}
        variant="all"
        {...props}
      />,
    )
    expect(screen.getByText("Claim")).toBeInTheDocument()
  })

  it("a non-actionable (history) row has no Approve/Review button", () => {
    draw(
      <ApprovalRow item={{ ...item(), actionable: false }} variant="typed" {...props} />,
    )
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^review$/i })).not.toBeInTheDocument()
  })

  it("applies the overdue accent", () => {
    const { container } = draw(
      <ApprovalRow
        item={item({ submitted_at: "2020-01-01T00:00:00Z" })}
        variant="typed"
        {...props}
      />,
    )
    expect(container.querySelector(".border-l-coral")).not.toBeNull()
  })
})
