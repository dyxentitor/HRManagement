import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ feed: vi.fn() }))
vi.mock("./api", () => ({ announcementsApi: { feed: mocks.feed } }))
vi.mock("@/lib/perm", () => ({ useCan: () => true }))

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
