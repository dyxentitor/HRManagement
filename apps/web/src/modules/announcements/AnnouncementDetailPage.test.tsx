import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ get: vi.fn(), markRead: vi.fn() }))
vi.mock("./api", () => ({
  announcementsApi: { get: mocks.get, markRead: mocks.markRead, attachmentUrl: vi.fn() },
}))

import AnnouncementDetailPage from "./AnnouncementDetailPage"

beforeEach(() => {
  mocks.get.mockReset()
  mocks.markRead.mockReset()
  mocks.markRead.mockResolvedValue(undefined)
  mocks.get.mockResolvedValue({
    id: "a1",
    title: "Holiday notice",
    body: "Office closed Friday.",
    category: "holiday",
    priority: "normal",
    status: "published",
    pinned: false,
    published_at: "2026-07-06T00:00:00Z",
    scheduled_at: null,
    expires_at: null,
    audience_type: "all",
    audience_spec: [],
    created_by: null,
    created_at: "2026-07-06T00:00:00Z",
    is_read: false,
    attachments: [],
  })
})

test("renders the announcement and marks it read on open", async () => {
  render(
    <MemoryRouter initialEntries={["/announcements/a1"]}>
      <Routes>
        <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText("Holiday notice")).toBeInTheDocument()
  expect(screen.getByText("Office closed Friday.")).toBeInTheDocument()
  await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith("a1"))
})
