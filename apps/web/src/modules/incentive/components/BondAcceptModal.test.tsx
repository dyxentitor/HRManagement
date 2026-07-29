import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { MeEligibility } from "../api"
import { BondAcceptModal } from "./BondAcceptModal"

const ELIGIBILITY: MeEligibility = {
  has_bond: true,
  bond_id: "bond-1",
  accepted: false,
  accepted_at: null,
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  is_active: false,
  days_remaining: 0,
  terms_version: "v1",
} as MeEligibility

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn()
  render(
    <BondAcceptModal
      eligibility={ELIGIBILITY}
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm, onOpenChange }
}

describe("BondAcceptModal", () => {
  it("summarises the bond: duration, dates, and terms version", () => {
    setup()
    expect(screen.getByText("Mandays Incentive Bond")).toBeInTheDocument()
    expect(screen.getByText(/Terms v1/)).toBeInTheDocument()
    expect(screen.getByText(/11 month|12 month/)).toBeInTheDocument() // duration
    expect(screen.getByText("1 Jan 2026")).toBeInTheDocument()
    expect(screen.getByText("31 Dec 2026")).toBeInTheDocument()
    expect(screen.getByText(/read, understood, and agree/)).toBeInTheDocument()
  })

  it("Accept Bond is disabled until the agreement checkbox is ticked", async () => {
    const { onConfirm } = setup()
    const acceptBtn = screen.getByRole("button", { name: /Accept Bond/i })
    expect(acceptBtn).toBeDisabled()
    await userEvent.click(acceptBtn).catch(() => undefined)
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByLabelText(/I have read and agree/i))
    expect(acceptBtn).not.toBeDisabled()
  })

  it("confirms once and closes on success; rapid double-click doesn't duplicate", async () => {
    let resolve!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    const { onOpenChange } = setup(onConfirm)
    await userEvent.click(screen.getByLabelText(/I have read and agree/i))
    const acceptBtn = screen.getByRole("button", { name: /Accept Bond/i })
    await userEvent.click(acceptBtn)
    // busy state: button shows Accepting… and further clicks are ignored
    expect(screen.getByRole("button", { name: /Accepting…/i })).toBeDisabled()
    await userEvent
      .click(screen.getByRole("button", { name: /Accepting…/i }))
      .catch(() => undefined)
    resolve()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("stays open when acceptance fails", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("boom"))
    const { onOpenChange } = setup(onConfirm)
    await userEvent.click(screen.getByLabelText(/I have read and agree/i))
    await userEvent.click(screen.getByRole("button", { name: /Accept Bond/i }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    // button recovers for a retry
    expect(await screen.findByRole("button", { name: /Accept Bond/i })).not.toBeDisabled()
  })

  it("Cancel closes without confirming", async () => {
    const { onConfirm, onOpenChange } = setup()
    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
