import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  manageList: vi.fn(),
  publish: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}))
const perm = vi.hoisted(() => ({ canWrite: true }))
vi.mock("./api", () => ({ announcementsApi: mocks }))
vi.mock("@/lib/perm", () => ({ useCan: () => perm.canWrite }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AnnouncementsManagePage from "./AnnouncementsManagePage"

const row = (over = {}) => ({
  id: "a1",
  title: "Draft one",
  body: "b",
  category: "general",
  priority: "normal",
  status: "draft",
  pinned: false,
  published_at: null,
  scheduled_at: null,
  expires_at: null,
  audience_type: "all",
  audience_spec: [],
  created_by: null,
  created_at: "2026-07-06T00:00:00Z",
  is_read: false,
  attachments: [],
  ...over,
})

beforeEach(() => {
  for (const f of Object.values(mocks)) f.mockReset()
  mocks.manageList.mockResolvedValue([row()])
  mocks.publish.mockResolvedValue(row({ status: "published" }))
  perm.canWrite = true
})

test("redirects non-writers to the reader feed", async () => {
  perm.canWrite = false
  render(
    <MemoryRouter initialEntries={["/announcements/manage"]}>
      <Routes>
        <Route path="/announcements/manage" element={<AnnouncementsManagePage />} />
        <Route path="/announcements" element={<div>reader-feed</div>} />
      </Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText("reader-feed")).toBeInTheDocument()
  expect(mocks.manageList).not.toHaveBeenCalled()
})

test("renders rows and publishes", async () => {
  render(
    <MemoryRouter>
      <AnnouncementsManagePage />
    </MemoryRouter>,
  )
  expect(await screen.findByText("Draft one")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Publish" }))
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith("a1"))
})
