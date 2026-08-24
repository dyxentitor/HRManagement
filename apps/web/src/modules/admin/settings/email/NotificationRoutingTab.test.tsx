import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Harness note: the task brief's Step 1 draft used msw (setupServer/http.get).
// This repo's sibling component test (EmailTemplatesTab.test.tsx) instead
// mocks its API module directly with vi.mock — and there is no msw usage
// anywhere else in apps/web/src. Per the task instructions, when the brief
// and the sibling test's actual pattern conflict, the sibling wins. All
// assertions below are otherwise verbatim from the brief.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
}))

vi.mock("../notification-routing-api", () => ({
  notificationRoutingApi: {
    list: mocks.list,
    save: mocks.save,
  },
}))

// Same shape as EmailTemplatesTab.test.tsx, but through a mutable flag so the
// permission-gating block below can render without :write.
const perms = vi.hoisted(() => ({ canWrite: true }))
vi.mock("@/lib/perm", () => ({ useCan: () => perms.canWrite }))

import NotificationRoutingTab from "./NotificationRoutingTab"

const LEAVE_APPROVED = {
  type: "leave.approved",
  label: "Leave request approved",
  domain: "leave",
  domain_label: "Leave",
  security: false,
  sensitive_content: true,
  email_default: true,
  in_app_enabled: true,
  email_enabled: true,
  delivery: "auto",
  cc_entries: [],
  available_tokens: [
    { token: "{approver}", label: "Approver" },
    { token: "{hr_managers}", label: "HR managers" },
  ],
}

// `email_default: false` — seed_for_user() writes an explicit opt-out for every
// user on this type, so a CC configured here would usually never send.
const LEAVE_CANCELLED = {
  type: "leave.cancelled",
  label: "Leave request cancelled",
  domain: "leave",
  domain_label: "Leave",
  security: false,
  sensitive_content: false,
  email_default: false,
  in_app_enabled: true,
  email_enabled: true,
  delivery: "auto",
  cc_entries: [],
  available_tokens: [{ token: "{hr_managers}", label: "HR managers" }],
}

const PASSWORD_CHANGED = {
  type: "auth.password_changed",
  label: "Password changed",
  domain: "auth",
  domain_label: "Account & security",
  security: true,
  sensitive_content: true,
  email_default: true,
  in_app_enabled: true,
  email_enabled: true,
  delivery: "auto",
  cc_entries: [],
  available_tokens: [{ token: "{hr_managers}", label: "HR managers" }],
}

const ROWS = [LEAVE_APPROVED, PASSWORD_CHANGED]

beforeEach(() => {
  perms.canWrite = true
  mocks.list.mockReset()
  mocks.save.mockReset()
  mocks.list.mockResolvedValue(ROWS.map((r) => ({ ...r })))
})

describe("NotificationRoutingTab", () => {
  it("groups rows under their domain heading", async () => {
    render(<NotificationRoutingTab />)
    expect(await screen.findByText("Leave")).toBeInTheDocument()
    expect(screen.getByText("Account & security")).toBeInTheDocument()
    expect(screen.getByText("Leave request approved")).toBeInTheDocument()
  })

  it("locks the email toggle on a security type", async () => {
    render(<NotificationRoutingTab />)
    await screen.findByText("Password changed")
    const row = screen.getByTestId("routing-row-auth.password_changed")
    expect(within(row).getByLabelText(/email/i)).toBeDisabled()
  })

  it("leaves the email toggle editable on a non-security type", async () => {
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    expect(within(row).getByLabelText(/email/i)).toBeEnabled()
  })

  it("shows the sensitive-content caution once a CC is present", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, cc_entries: ["hr@provintell.com"] }])
    render(<NotificationRoutingTab />)
    expect(await screen.findByText(/recipients will see/i)).toBeInTheDocument()
  })

  it("hides the caution when the CC list is empty", async () => {
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    expect(screen.queryByText(/recipients will see/i)).not.toBeInTheDocument()
  })

  it("saves only rows the user changed", async () => {
    mocks.save.mockResolvedValue(ROWS.map((r) => ({ ...r })))
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith([
      {
        type: "leave.approved",
        in_app_enabled: true,
        email_enabled: true,
        delivery: "auto",
        cc_entries: ["hr@provintell.com"],
      },
    ])
  })

  it("applies a bulk CC list to the selected rows only", async () => {
    mocks.save.mockResolvedValue(ROWS.map((r) => ({ ...r })))
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    await userEvent.click(screen.getByLabelText(/select Leave request approved/i))
    await userEvent.type(screen.getByLabelText(/bulk cc/i), "hr@provintell.com{Enter}")
    await userEvent.click(screen.getByRole("button", { name: /apply to 1 selected/i }))
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith([
      {
        type: "leave.approved",
        in_app_enabled: true,
        email_enabled: true,
        delivery: "auto",
        cc_entries: ["hr@provintell.com"],
      },
    ])
  })

  it("surfaces a save error", async () => {
    mocks.save.mockRejectedValue(new Error("Invalid CC entry"))
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    expect(await screen.findByText("Invalid CC entry")).toBeInTheDocument()
  })

  it("shows a load error when the list fails", async () => {
    mocks.list.mockReset()
    mocks.list.mockRejectedValue(new Error("Permission denied"))
    render(<NotificationRoutingTab />)
    expect(await screen.findByText("Permission denied")).toBeInTheDocument()
  })
})

describe("NotificationRoutingTab — digest/CC guard", () => {
  it("flips a digest row to Auto when a CC is added, and shows an inline note", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, delivery: "digest" }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    expect(within(row).queryByText(/switched to auto/i)).not.toBeInTheDocument()

    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")

    expect(within(row).getByText(/switched to auto/i)).toBeInTheDocument()
  })

  it("saves the flipped delivery value, not the original digest value", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, delivery: "digest" }])
    mocks.save.mockResolvedValue([
      { ...LEAVE_APPROVED, delivery: "auto", cc_entries: ["hr@provintell.com"] },
    ])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith([
      {
        type: "leave.approved",
        in_app_enabled: true,
        email_enabled: true,
        delivery: "auto",
        cc_entries: ["hr@provintell.com"],
      },
    ])
  })

  it("does not flip delivery or show the note when the row is already Auto/Immediate", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, delivery: "immediate" }])
    mocks.save.mockResolvedValue([
      { ...LEAVE_APPROVED, delivery: "immediate", cc_entries: ["hr@provintell.com"] },
    ])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")

    expect(within(row).queryByText(/switched to auto/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith([
      {
        type: "leave.approved",
        in_app_enabled: true,
        email_enabled: true,
        delivery: "immediate",
        cc_entries: ["hr@provintell.com"],
      },
    ])
  })

  it("restores the original digest lane when the CC is removed again", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, delivery: "digest" }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")

    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")
    expect(within(row).getByText(/switched to auto/i)).toBeInTheDocument()
    expect(within(row).getByLabelText(/delivery for/i)).toHaveTextContent("Auto")

    await userEvent.click(within(row).getByLabelText("Remove hr@provintell.com"))

    expect(within(row).queryByText(/switched to auto/i)).not.toBeInTheDocument()
    expect(within(row).getByLabelText(/delivery for/i)).toHaveTextContent("Digest")

    // Back to the stored state, so the row is no longer a diff and Save is
    // inert — it must not persist a lane change the user never asked for.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps an explicit delivery choice when the CC is removed", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, delivery: "digest" }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")

    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")
    expect(within(row).getByLabelText(/delivery for/i)).toHaveTextContent("Auto")

    // Radix's Select trigger is pointer-driven; keyboard activation avoids the
    // pointer-capture APIs happy-dom does not implement.
    within(row)
      .getByLabelText(/delivery for/i)
      .focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await screen.findByRole("option", { name: "Immediate" }))
    expect(within(row).getByLabelText(/delivery for/i)).toHaveTextContent("Immediate")

    await userEvent.click(within(row).getByLabelText("Remove hr@provintell.com"))

    // The user picked Immediate on purpose; clearing the CC must not undo it.
    expect(within(row).getByLabelText(/delivery for/i)).toHaveTextContent("Immediate")
  })

  it("flips a selected digest row via bulk-apply CC too", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, delivery: "digest" }])
    mocks.save.mockResolvedValue([
      { ...LEAVE_APPROVED, delivery: "auto", cc_entries: ["hr@provintell.com"] },
    ])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    await userEvent.click(screen.getByLabelText(/select Leave request approved/i))
    await userEvent.type(screen.getByLabelText(/bulk cc/i), "hr@provintell.com{Enter}")
    await userEvent.click(screen.getByRole("button", { name: /apply to 1 selected/i }))

    const row = screen.getByTestId("routing-row-leave.approved")
    expect(within(row).getByText(/switched to auto/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith([
      {
        type: "leave.approved",
        in_app_enabled: true,
        email_enabled: true,
        delivery: "auto",
        cc_entries: ["hr@provintell.com"],
      },
    ])
  })
})

describe("NotificationRoutingTab — email_default caution", () => {
  it("warns when a CC sits on a type most users have email off for", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_CANCELLED, cc_entries: ["hr@provintell.com"] }])
    render(<NotificationRoutingTab />)
    expect(await screen.findByText(/may not send/i)).toBeInTheDocument()
  })

  it("stays silent when that type has no CC configured", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_CANCELLED }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request cancelled")
    expect(screen.queryByText(/may not send/i)).not.toBeInTheDocument()
  })

  it("stays silent on an email_default: true type that has a CC", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, cc_entries: ["hr@provintell.com"] }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    expect(screen.queryByText(/may not send/i)).not.toBeInTheDocument()
  })

  it("appears as soon as the admin adds the CC, not only on reload", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_CANCELLED }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request cancelled")
    const row = screen.getByTestId("routing-row-leave.cancelled")
    await userEvent.type(within(row).getByRole("textbox"), "hr@provintell.com{Enter}")
    expect(within(row).getByText(/may not send/i)).toBeInTheDocument()
  })
})

describe("NotificationRoutingTab — write permission", () => {
  it("disables every control without org:email_config:write", async () => {
    perms.canWrite = false
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, cc_entries: ["hr@provintell.com"] }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")

    expect(within(row).getByLabelText(/select Leave request approved/i)).toBeDisabled()
    expect(within(row).getByLabelText("In-app")).toBeDisabled()
    expect(within(row).getByLabelText("Email")).toBeDisabled()
    expect(within(row).getByLabelText(/delivery for/i)).toBeDisabled()
    // Both the CC text input and its chip-removal button.
    expect(within(row).getByRole("textbox")).toBeDisabled()
    expect(within(row).getByLabelText("Remove hr@provintell.com")).toBeDisabled()
    expect(within(row).getByLabelText("Add recipient token")).toBeDisabled()

    expect(screen.getByLabelText(/bulk cc/i)).toBeDisabled()
    expect(screen.getByRole("button", { name: /apply to 0 selected/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled()
  })

  it("leaves the controls editable with :write", async () => {
    mocks.list.mockResolvedValue([{ ...LEAVE_APPROVED, cc_entries: ["hr@provintell.com"] }])
    render(<NotificationRoutingTab />)
    await screen.findByText("Leave request approved")
    const row = screen.getByTestId("routing-row-leave.approved")
    expect(within(row).getByLabelText("In-app")).toBeEnabled()
    expect(within(row).getByRole("textbox")).toBeEnabled()
    expect(screen.getByLabelText(/bulk cc/i)).toBeEnabled()
  })
})
