import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoisted mock factories — must run before any import of the mocked modules.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  // emailTemplateApi
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
  preview: vi.fn(),
  sendTest: vi.fn(),
  // emailConfigApi
  cfgGet: vi.fn(),
  cfgPatch: vi.fn(),
}))

vi.mock("../email-template-api", () => ({
  emailTemplateApi: {
    list: mocks.list,
    get: mocks.get,
    save: mocks.save,
    reset: mocks.reset,
    preview: mocks.preview,
    sendTest: mocks.sendTest,
  },
}))

vi.mock("../email-config-api", () => ({
  emailConfigApi: {
    get: mocks.cfgGet,
    patch: mocks.cfgPatch,
  },
}))

vi.mock("@/lib/perm", () => ({ useCan: () => true }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// ---------------------------------------------------------------------------
// Import under test (after vi.mock declarations)
// ---------------------------------------------------------------------------
import EmailTemplatesTab from "./EmailTemplatesTab"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEMPLATES = [
  { key: "leave_approved", label: "Leave Approved", has_override: false },
  { key: "leave_rejected", label: "Leave Rejected", has_override: true },
]

const DETAIL = {
  key: "leave_approved",
  subject: "Your leave has been approved",
  html_body: "<p>Hello {{employee_name}}</p>",
  text_body: "Hello {{employee_name}}",
  has_override: false,
  placeholders: [{ name: "employee_name", description: "Employee full name", sample: "Alice" }],
}

const PREVIEW = {
  subject: "Your leave has been approved",
  html: "<p>Hello Alice</p>",
  text: "Hello Alice",
}

const EMPTY_CFG = {
  enabled: false,
  smtp_host: "",
  smtp_port: 587,
  encryption: "starttls",
  use_auth: true,
  smtp_username: "",
  has_password: false,
  sender_name: "",
  sender_email: "",
  reply_to: "",
  connection_timeout: 10,
  rate_limit_per_minute: 60,
  max_retry_attempts: 3,
  retry_interval_seconds: 60,
  signature: "",
  provider_preset: "",
  accent_color: "",
  header_html: "",
  footer_html: "",
  last_test_at: null,
  last_success_at: null,
  last_failure_at: null,
  last_failure_message: "",
  updated_at: "2026-07-01T00:00:00Z",
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  for (const fn of [
    mocks.list,
    mocks.get,
    mocks.save,
    mocks.reset,
    mocks.preview,
    mocks.sendTest,
    mocks.cfgGet,
    mocks.cfgPatch,
  ])
    fn.mockReset()

  mocks.list.mockResolvedValue([...TEMPLATES])
  mocks.cfgGet.mockResolvedValue({ ...EMPTY_CFG })
  mocks.preview.mockResolvedValue({ ...PREVIEW })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders the template list returned by emailTemplateApi.list()", async () => {
  render(<EmailTemplatesTab />)
  // Wait for async list load
  await waitFor(() => screen.getByText("Leave Approved"))
  expect(screen.getByText("Leave Rejected")).toBeInTheDocument()
  // The "custom" badge only appears for templates with has_override = true
  expect(screen.getByText("custom")).toBeInTheDocument()
})

test("selecting a template calls get() and populates the editor fields", async () => {
  mocks.get.mockResolvedValue({ ...DETAIL })
  render(<EmailTemplatesTab />)
  await waitFor(() => screen.getByText("Leave Approved"))

  await userEvent.click(screen.getByText("Leave Approved"))

  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("leave_approved"))
  // Subject input should now contain the loaded value
  const subjectInput = await screen.findByLabelText(/email subject/i)
  expect(subjectInput).toHaveValue("Your leave has been approved")
  // HTML and plain-text textareas should also be populated
  const htmlTextarea = screen.getByLabelText(/html body/i)
  expect(htmlTextarea).toHaveValue("<p>Hello {{employee_name}}</p>")
  const textTextarea = screen.getByLabelText(/plain text body/i)
  expect(textTextarea).toHaveValue("Hello {{employee_name}}")
})

test("editing the subject triggers a debounced preview call after 600 ms", async () => {
  mocks.get.mockResolvedValue({ ...DETAIL })
  render(<EmailTemplatesTab />)
  await waitFor(() => screen.getByText("Leave Approved"))
  await userEvent.click(screen.getByText("Leave Approved"))
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("leave_approved"))

  const subjectInput = await screen.findByLabelText(/email subject/i)

  // Switch to fake timers to control the 600 ms debounce
  vi.useFakeTimers({ shouldAdvanceTime: true })

  // Clear and type a new value — userEvent works with shouldAdvanceTime
  await userEvent.clear(subjectInput)
  await userEvent.type(subjectInput, "X")

  // preview should NOT have been called yet (debounce still pending)
  expect(mocks.preview).not.toHaveBeenCalled()

  // Advance fake timers past the 600 ms debounce and flush micro-tasks
  await act(async () => {
    vi.advanceTimersByTime(700)
  })

  await waitFor(() => expect(mocks.preview).toHaveBeenCalled())
  const [calledKey] = mocks.preview.mock.calls[0] as [string, unknown]
  expect(calledKey).toBe("leave_approved")
})

test("Save button calls emailTemplateApi.save() with the current editor fields", async () => {
  mocks.get.mockResolvedValue({ ...DETAIL })
  mocks.save.mockResolvedValue({ ...DETAIL, subject: "Saved subject", has_override: true })
  render(<EmailTemplatesTab />)
  await waitFor(() => screen.getByText("Leave Approved"))
  await userEvent.click(screen.getByText("Leave Approved"))
  await waitFor(() => screen.findByLabelText(/email subject/i))

  const subjectInput = screen.getByLabelText(/email subject/i)
  await userEvent.clear(subjectInput)
  await userEvent.type(subjectInput, "Saved subject")

  await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  const [key, payload] = mocks.save.mock.calls[0] as [string, Record<string, string>]
  expect(key).toBe("leave_approved")
  expect(payload.subject).toBe("Saved subject")
})

test("Reset button calls emailTemplateApi.reset() and reloads the template", async () => {
  // has_override must be true for the Reset button to be enabled
  const overriddenDetail = { ...DETAIL, has_override: true }
  mocks.get.mockResolvedValue(overriddenDetail)
  mocks.reset.mockResolvedValue(undefined)
  render(<EmailTemplatesTab />)
  await waitFor(() => screen.getByText("Leave Approved"))
  await userEvent.click(screen.getByText("Leave Approved"))
  await waitFor(() => screen.findByRole("button", { name: /reset to default/i }))

  await userEvent.click(screen.getByRole("button", { name: /reset to default/i }))

  await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith("leave_approved"))
  // After reset, get() should be called again to reload the canonical template
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
})

test("Send test dialog: calls emailTemplateApi.sendTest() with the entered recipient", async () => {
  mocks.get.mockResolvedValue({ ...DETAIL })
  mocks.sendTest.mockResolvedValue({ success: true, message: "Sent", detail: "Test email sent" })
  render(<EmailTemplatesTab />)
  await waitFor(() => screen.getByText("Leave Approved"))
  await userEvent.click(screen.getByText("Leave Approved"))
  await waitFor(() => screen.findByRole("button", { name: /send test/i }))

  // Open the dialog
  await userEvent.click(screen.getByRole("button", { name: /send test/i }))
  // Dialog should appear
  const recipientInput = await screen.findByLabelText(/recipient email address/i)
  await userEvent.type(recipientInput, "tester@example.com")

  await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

  await waitFor(() => expect(mocks.sendTest).toHaveBeenCalledTimes(1))
  const [key, recipient] = mocks.sendTest.mock.calls[0] as [string, string]
  expect(key).toBe("leave_approved")
  expect(recipient).toBe("tester@example.com")
})
