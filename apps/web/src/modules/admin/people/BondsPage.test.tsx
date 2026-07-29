import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BondCoverageRow } from "@/modules/incentive/api"

const mocks = vi.hoisted(() => ({
  coverage: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  revoke: vi.fn(),
  useCan: vi.fn(),
}))

vi.mock("@/modules/incentive/api", () => ({
  incentiveApi: {
    bonds: {
      coverage: mocks.coverage,
      create: mocks.create,
      update: mocks.update,
      revoke: mocks.revoke,
    },
  },
}))
vi.mock("@/lib/perm", () => ({ useCan: mocks.useCan }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import BondsPage from "./BondsPage"

function row(
  name: string,
  code: string,
  status: BondCoverageRow["status"],
  bond: Partial<NonNullable<BondCoverageRow["bond"]>> | null,
): BondCoverageRow {
  return {
    employee_id: `id-${code}`,
    employee_name: name,
    employee_code: code,
    status,
    bond: bond
      ? {
          id: `bond-${code}`,
          employee_id: `id-${code}`,
          accepted_at: null,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          terms_version: "v1",
          is_active: false,
          created_at: "2026-01-01T00:00:00Z",
          ...bond,
        }
      : null,
  }
}

const ROWS: BondCoverageRow[] = [
  row("Aisha Rahman", "E001", "active", { accepted_at: "2026-01-02T00:00:00Z", is_active: true }),
  row("Marcus Lim", "E002", "pending", {}),
  row("Priya Nair", "E003", "expired", {
    accepted_at: "2025-01-02T00:00:00Z",
    period_start: "2025-01-01",
    period_end: "2025-06-30",
  }),
  row("Sam Lee", "E004", "none", null),
]

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }))
}

beforeEach(() => {
  mocks.useCan.mockReturnValue(true)
  mocks.coverage.mockResolvedValue(ROWS)
})
afterEach(() => vi.clearAllMocks())

describe("BondsPage", () => {
  it("renders coverage rows with status pills and filter-pill counts", async () => {
    render(<BondsPage />)
    expect(await screen.findByText("Aisha Rahman")).toBeInTheDocument()
    expect(screen.getByText("Sam Lee")).toBeInTheDocument()
    // filter pills show per-status counts of 1
    const noBondPill = screen.getByRole("button", { name: /No bond/ })
    expect(within(noBondPill).getByText("1")).toBeInTheDocument()
    // table shows StatusPill labels
    expect(screen.getByText("Awaiting acceptance")).toBeInTheDocument()
  })

  it("filter pill filters the table to that status", async () => {
    render(<BondsPage />)
    await screen.findByText("Aisha Rahman")
    await userEvent.click(screen.getByRole("button", { name: /No bond/ }))
    expect(screen.getByText("Sam Lee")).toBeInTheDocument()
    expect(screen.queryByText("Aisha Rahman")).toBeNull()
  })

  it("search filters by name and code", async () => {
    render(<BondsPage />)
    await screen.findByText("Aisha Rahman")
    await userEvent.type(screen.getByLabelText("Search employees"), "E003")
    expect(screen.getByText("Priya Nair")).toBeInTheDocument()
    expect(screen.queryByText("Aisha Rahman")).toBeNull()
  })

  it("kebab menu offers Create bond for unbonded, Edit/Revoke for bonded", async () => {
    render(<BondsPage />)
    await screen.findByText("Sam Lee")
    await openMenu("Sam Lee")
    expect(await screen.findByRole("menuitem", { name: /Create bond/i })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Revoke/i })).toBeNull()
    await userEvent.keyboard("{Escape}")
    await openMenu("Aisha Rahman")
    expect(await screen.findByRole("menuitem", { name: /Edit bond/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Revoke/i })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Create bond/i })).toBeNull()
  })

  it("create flow posts the bond and refetches", async () => {
    mocks.create.mockResolvedValue({})
    render(<BondsPage />)
    await screen.findByText("Sam Lee")
    await openMenu("Sam Lee")
    await userEvent.click(await screen.findByRole("menuitem", { name: /Create bond/i }))
    await userEvent.type(await screen.findByLabelText("Period start"), "2026-08-01")
    await userEvent.type(screen.getByLabelText("Period end"), "2027-07-31")
    await userEvent.click(screen.getByRole("button", { name: /^Create bond$/i }))
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        employee_id: "id-E004",
        period_start: "2026-08-01",
        period_end: "2027-07-31",
        terms_version: "v1",
      }),
    )
    await waitFor(() => expect(mocks.coverage).toHaveBeenCalledTimes(2))
  })

  it("edit shows the re-accept hint when terms change", async () => {
    render(<BondsPage />)
    await screen.findByText("Aisha Rahman")
    await openMenu("Aisha Rahman")
    await userEvent.click(await screen.findByRole("menuitem", { name: /Edit bond/i }))
    const terms = await screen.findByLabelText("Terms version")
    await userEvent.clear(terms)
    await userEvent.type(terms, "v2")
    expect(await screen.findByText(/re-accept the bond/i)).toBeInTheDocument()
  })

  it("revoke flows through the confirm dialog", async () => {
    mocks.revoke.mockResolvedValue(undefined)
    render(<BondsPage />)
    await screen.findByText("Aisha Rahman")
    await openMenu("Aisha Rahman")
    await userEvent.click(await screen.findByRole("menuitem", { name: /Revoke/i }))
    expect(await screen.findByText(/Revoke Aisha Rahman's bond\?/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /^Revoke$|^Confirm$/i }))
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("bond-E001"))
  })

  it("shows the no-permission state without fetching", () => {
    mocks.useCan.mockReturnValue(false)
    render(<BondsPage />)
    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument()
    expect(mocks.coverage).not.toHaveBeenCalled()
  })
})
