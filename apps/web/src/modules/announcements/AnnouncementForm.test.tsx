import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }))
vi.mock("./api", () => ({ announcementsApi: mocks }))
vi.mock("@/lib/perm", () => ({ useCan: () => true }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AnnouncementForm from "./AnnouncementForm"

beforeEach(() => {
  mocks.create.mockReset()
  mocks.create.mockResolvedValue({ id: "a1" })
})

test("requires a title before creating", async () => {
  render(
    <MemoryRouter>
      <AnnouncementForm />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole("button", { name: /create/i }))
  expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
  expect(mocks.create).not.toHaveBeenCalled()
})

test("creates with publish_now when 'Publish now' is selected", async () => {
  render(
    <MemoryRouter>
      <AnnouncementForm />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hello" } })
  fireEvent.click(screen.getByRole("button", { name: /create/i }))
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Hello", publish_now: true }),
    ),
  )
})
