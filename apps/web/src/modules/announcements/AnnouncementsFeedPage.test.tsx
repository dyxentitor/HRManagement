import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ feed: vi.fn() }))
const perm = vi.hoisted(() => ({ canManage: true }))
vi.mock("./api", () => ({ announcementsApi: { feed: mocks.feed } }))
vi.mock("@/lib/perm", () => ({
  useCan: (code: string) => (code === "announcement:write" ? perm.canManage : true),
}))

import AnnouncementsFeedPage from "./AnnouncementsFeedPage"

const ann = (over = {}) => ({
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
  ...over,
})

beforeEach(() => {
  mocks.feed.mockReset()
  mocks.feed.mockResolvedValue([ann()])
  perm.canManage = true
})

test("renders feed items with an unread indicator", async () => {
  render(
    <MemoryRouter>
      <AnnouncementsFeedPage />
    </MemoryRouter>,
  )
  expect(await screen.findByText("Holiday notice")).toBeInTheDocument()
  expect(screen.getByLabelText("unread")).toBeInTheDocument()
})

test("Manage button shows for writers and hides for others", async () => {
  const { unmount } = render(
    <MemoryRouter>
      <AnnouncementsFeedPage />
    </MemoryRouter>,
  )
  await screen.findByText("Holiday notice")
  expect(screen.getByRole("button", { name: /manage announcements/i })).toBeInTheDocument()
  unmount()

  perm.canManage = false
  render(
    <MemoryRouter>
      <AnnouncementsFeedPage />
    </MemoryRouter>,
  )
  await screen.findByText("Holiday notice")
  expect(screen.queryByRole("button", { name: /manage announcements/i })).toBeNull()
})

test("changing the category filter refetches with the category", async () => {
  render(
    <MemoryRouter>
      <AnnouncementsFeedPage />
    </MemoryRouter>,
  )
  await screen.findByText("Holiday notice")
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "policy" } })
  await waitFor(() =>
    expect(mocks.feed).toHaveBeenLastCalledWith(expect.objectContaining({ category: "policy" })),
  )
})
