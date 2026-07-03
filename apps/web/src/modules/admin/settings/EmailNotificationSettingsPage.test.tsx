import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  testConnection: vi.fn(),
  sendTestEmail: vi.fn(),
}))

vi.mock("./email-config-api", () => ({
  emailConfigApi: {
    get: mocks.get,
    patch: mocks.patch,
    testConnection: mocks.testConnection,
    sendTestEmail: mocks.sendTestEmail,
  },
}))
vi.mock("@/lib/perm", () => ({ useCan: () => true }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import EmailNotificationSettingsPage from "./EmailNotificationSettingsPage"

const CONFIG = {
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
  last_test_at: null,
  last_success_at: null,
  last_failure_at: null,
  last_failure_message: "",
  updated_at: "2026-07-03T00:00:00Z",
}

beforeEach(() => {
  for (const fn of [mocks.get, mocks.patch, mocks.testConnection, mocks.sendTestEmail])
    fn.mockReset()
  mocks.get.mockResolvedValue({ ...CONFIG })
})

test("renders and blocks save when enabled without a host", async () => {
  render(<EmailNotificationSettingsPage />)
  await waitFor(() => screen.getByLabelText(/SMTP host/i))
  fireEvent.click(screen.getByRole("switch", { name: /enable email notifications/i }))
  await userEvent.click(screen.getByRole("button", { name: /save/i }))
  // Both host and sender_email surface the "required when enabled" message.
  const errs = await screen.findAllByText(/required when email is enabled/i)
  expect(errs.length).toBeGreaterThan(0)
  expect(mocks.patch).not.toHaveBeenCalled()
})

test("saves a valid config", async () => {
  mocks.patch.mockResolvedValue({ ...CONFIG, sender_name: "HR" })
  render(<EmailNotificationSettingsPage />)
  await waitFor(() => screen.getByLabelText(/Sender name/i))
  await userEvent.type(screen.getByLabelText(/Sender name/i), "HR")
  await userEvent.click(screen.getByRole("button", { name: /save/i }))
  await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1))
})
