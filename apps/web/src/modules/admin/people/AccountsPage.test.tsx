import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const rows = vi.hoisted(() => [
  {
    id: "1",
    email: "a@x.com",
    status: "active",
    is_active: true,
    mfa_enabled: false,
    last_login_at: null,
    role_codes: ["org_admin"],
    employee: { id: "e1", full_name: "Amy A", employee_code: "E1" },
  },
  {
    id: "2",
    email: "b@x.com",
    status: "disabled",
    is_active: false,
    mfa_enabled: true,
    last_login_at: null,
    role_codes: [],
    employee: null,
  },
])

vi.mock("@/lib/perm", () => ({ useCan: () => true }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "admin", email: "admin@x.com" } }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("./accounts-api", () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue(rows),
    disable: vi.fn(),
    enable: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
  },
}))

import { AccountsPage } from "./AccountsPage"

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe("AccountsPage", () => {
  it("lists accounts with email, linked employee and unlinked marker", async () => {
    wrap(<AccountsPage />)
    await waitFor(() => expect(screen.getByText("a@x.com")).toBeInTheDocument())
    expect(screen.getByText("b@x.com")).toBeInTheDocument()
    expect(screen.getByText("Amy A")).toBeInTheDocument()
    expect(screen.getByText(/unlinked/i)).toBeInTheDocument()
    // "Disabled" appears as both a filter chip and row b's status pill.
    expect(screen.getAllByText("Disabled").length).toBeGreaterThanOrEqual(2)
  })
})
