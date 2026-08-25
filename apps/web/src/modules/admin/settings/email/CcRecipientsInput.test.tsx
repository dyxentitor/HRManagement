import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CcRecipientsInput, isValidCcEntry } from "./CcRecipientsInput"

const TOKENS = [
  { token: "{approver}", label: "Approver" },
  { token: "{hr_managers}", label: "HR managers" },
]

describe("isValidCcEntry", () => {
  it("accepts a well-formed email", () => {
    expect(isValidCcEntry("hr@provintell.com", TOKENS)).toBe(true)
  })
  it("rejects a malformed email", () => {
    expect(isValidCcEntry("not-an-email", TOKENS)).toBe(false)
  })
  it("accepts an offered token", () => {
    expect(isValidCcEntry("{approver}", TOKENS)).toBe(true)
  })
  it("rejects a token that is not offered", () => {
    expect(isValidCcEntry("{requester}", TOKENS)).toBe(false)
  })
})

describe("CcRecipientsInput", () => {
  it("renders an address as a chip", () => {
    render(<CcRecipientsInput value={["hr@provintell.com"]} tokens={TOKENS} onChange={vi.fn()} />)
    expect(screen.getByText("hr@provintell.com")).toBeInTheDocument()
  })

  it("renders a token using its readable label, not the raw braces", () => {
    render(<CcRecipientsInput value={["{approver}"]} tokens={TOKENS} onChange={vi.fn()} />)
    expect(screen.getByText("Approver")).toBeInTheDocument()
    expect(screen.queryByText("{approver}")).not.toBeInTheDocument()
  })

  it("adds an address on Enter", async () => {
    const onChange = vi.fn()
    render(<CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />)
    await userEvent.type(screen.getByRole("textbox"), "hr@provintell.com{Enter}")
    expect(onChange).toHaveBeenCalledWith(["hr@provintell.com"])
  })

  it("adds an address on comma", async () => {
    const onChange = vi.fn()
    render(<CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />)
    await userEvent.type(screen.getByRole("textbox"), "hr@provintell.com,")
    expect(onChange).toHaveBeenCalledWith(["hr@provintell.com"])
  })

  it("shows an inline error and does not add a malformed address", async () => {
    const onChange = vi.fn()
    render(<CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />)
    await userEvent.type(screen.getByRole("textbox"), "nope{Enter}")
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
  })

  it("ignores a duplicate address case-insensitively", async () => {
    const onChange = vi.fn()
    render(<CcRecipientsInput value={["hr@provintell.com"]} tokens={TOKENS} onChange={onChange} />)
    await userEvent.type(screen.getByRole("textbox"), "HR@Provintell.com{Enter}")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("removes a chip", async () => {
    const onChange = vi.fn()
    render(
      <CcRecipientsInput
        value={["hr@provintell.com", "{approver}"]}
        tokens={TOKENS}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /remove hr@provintell.com/i }))
    expect(onChange).toHaveBeenCalledWith(["{approver}"])
  })

  it("adds a token from the dropdown", async () => {
    const onChange = vi.fn()
    render(<CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: /add recipient token/i }))
    await userEvent.click(screen.getByRole("menuitem", { name: "Approver" }))
    expect(onChange).toHaveBeenCalledWith(["{approver}"])
  })

  it("does not offer a token that is already present", async () => {
    render(<CcRecipientsInput value={["{approver}"]} tokens={TOKENS} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /add recipient token/i }))
    expect(screen.queryByRole("menuitem", { name: "Approver" })).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "HR managers" })).toBeInTheDocument()
  })

  it("disables input and removal when disabled", () => {
    render(
      <CcRecipientsInput
        value={["hr@provintell.com"]}
        tokens={TOKENS}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("button", { name: /remove hr@provintell.com/i })).toBeDisabled()
  })
})

describe("CcRecipientsInput — blur commit", () => {
  it("commits a typed address on blur instead of discarding it", async () => {
    const onChange = vi.fn()
    render(
      <>
        <CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />
        <button type="button">Save</button>
      </>,
    )
    await userEvent.type(screen.getByRole("textbox"), "hr@provintell.com")
    // Clicking Save without pressing Enter first is the exact path that used
    // to lose the entry.
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onChange).toHaveBeenCalledWith(["hr@provintell.com"])
  })

  it("still reports a malformed address on blur", async () => {
    const onChange = vi.fn()
    render(
      <>
        <CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />
        <button type="button">Save</button>
      </>,
    )
    await userEvent.type(screen.getByRole("textbox"), "not-an-email")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
  })

  it("is a no-op when blurring an empty draft", async () => {
    const onChange = vi.fn()
    render(
      <>
        <CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />
        <button type="button">Save</button>
      </>,
    )
    await userEvent.click(screen.getByRole("textbox"))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/valid email address/i)).not.toBeInTheDocument()
  })

  it("is a no-op when blurring a whitespace-only draft", async () => {
    const onChange = vi.fn()
    render(
      <>
        <CcRecipientsInput value={[]} tokens={TOKENS} onChange={onChange} />
        <button type="button">Save</button>
      </>,
    )
    await userEvent.type(screen.getByRole("textbox"), "   ")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/valid email address/i)).not.toBeInTheDocument()
  })
})
