import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"

const nav = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => nav.fn,
}))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { email: "a@b.com" } }) }))
vi.mock("@/lib/cmdk", () => ({ useCommandPalette: () => ({ setOpen: vi.fn() }) }))
vi.mock("./UserMenu", () => ({ UserMenu: () => <div /> }))
vi.mock("@/modules/notifications/useNotifications", () => ({
  useNotifications: () => ({ unreadCount: 3 }),
}))
vi.mock("@/modules/notifications/components/NotificationDropdown", () => ({
  NotificationDropdown: () => <div>dropdown-body</div>,
}))

import { TopBar } from "./TopBar"

beforeEach(() => nav.fn.mockReset())

test("help icon navigates to /help", () => {
  render(
    <MemoryRouter>
      <TopBar />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole("button", { name: /help/i }))
  expect(nav.fn).toHaveBeenCalledWith("/help")
})

test("bell shows the unread badge count", () => {
  render(
    <MemoryRouter>
      <TopBar />
    </MemoryRouter>,
  )
  expect(screen.getByText("3")).toBeInTheDocument()
})
