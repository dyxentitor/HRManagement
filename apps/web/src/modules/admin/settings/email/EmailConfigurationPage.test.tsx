import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import EmailConfigurationPage, { EmailTabIndexRedirect } from "./EmailConfigurationPage"

vi.mock("@/lib/perm", () => ({ useCan: () => true }))

function shell(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/admin/settings/email" element={<EmailConfigurationPage />}>
          <Route index element={<EmailTabIndexRedirect />} />
          <Route path="server" element={<div>SERVER TAB</div>} />
          <Route path="templates" element={<div>TEMPLATES TAB</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe("EmailConfigurationPage", () => {
  it("shows the server tab on /server and marks its trigger active", async () => {
    shell("/admin/settings/email/server")
    expect(screen.getByText("SERVER TAB")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Email Server Configuration/i })).toHaveAttribute(
      "data-state",
      "active",
    )
  })
  it("clicking Email Templates navigates and remembers the tab", async () => {
    shell("/admin/settings/email/server")
    await userEvent.click(screen.getByRole("tab", { name: /Email Templates/i }))
    expect(await screen.findByText("TEMPLATES TAB")).toBeInTheDocument()
    expect(localStorage.getItem("email-settings-tab")).toBe("templates")
  })
  it("index redirects to the remembered tab (templates)", async () => {
    localStorage.setItem("email-settings-tab", "templates")
    shell("/admin/settings/email")
    expect(await screen.findByText("TEMPLATES TAB")).toBeInTheDocument()
  })
  it("index defaults to server when nothing remembered", async () => {
    shell("/admin/settings/email")
    expect(await screen.findByText("SERVER TAB")).toBeInTheDocument()
  })
})
