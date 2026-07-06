import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, test, vi } from "vitest"

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock("../useNotifications", () => ({ useNotifications: () => hook.value }))

import { NotificationDropdown, groupByTime } from "./NotificationDropdown"

const notif = (id: number, read: string | null = null) => ({
  id,
  type: "leave.approved",
  channel: "in_app",
  payload: {},
  deep_link: "/leave/me",
  priority: "normal",
  delivery_status: "pending",
  read_at: read,
  created_at: "2026-07-06T00:00:00Z",
})

beforeEach(() => {
  hook.value = {
    items: [notif(2), notif(1)],
    unreadCount: 2,
    loading: false,
    loadingMore: false,
    error: false,
    hasMore: false,
    refresh: vi.fn(),
    loadMore: vi.fn(),
    markOneRead: vi.fn().mockResolvedValue(undefined),
    markAll: vi.fn(),
    onOpen: vi.fn(),
  }
})

test("groupByTime buckets by Today / Yesterday / Earlier", () => {
  const now = new Date("2026-07-06T12:00:00Z")
  const mk = (id: number, iso: string) => ({ ...notif(id), created_at: iso }) as never
  const groups = groupByTime(
    [mk(1, "2026-07-06T09:00:00Z"), mk(2, "2026-07-05T09:00:00Z"), mk(3, "2026-07-01T09:00:00Z")],
    now,
  )
  expect(groups.today.map((n) => n.id)).toEqual([1])
  expect(groups.yesterday.map((n) => n.id)).toEqual([2])
  expect(groups.earlier.map((n) => n.id)).toEqual([3])
})

test("renders a time-group header for loaded items", () => {
  hook.value = { ...hook.value, items: [{ ...notif(9), created_at: new Date().toISOString() }] }
  render(<NotificationDropdown onNavigate={() => {}} />)
  expect(screen.getByText("Today")).toBeInTheDocument()
})

test("renders rows and mark-all", () => {
  render(<NotificationDropdown onNavigate={() => {}} />)
  expect(screen.getAllByText("Leave request approved")).toHaveLength(2)
  fireEvent.click(screen.getByRole("button", { name: /mark all read/i }))
  expect(hook.value.markAll).toHaveBeenCalled()
})

test("clicking a row marks it read then navigates", async () => {
  const onNavigate = vi.fn()
  render(<NotificationDropdown onNavigate={onNavigate} />)
  fireEvent.click(screen.getAllByText("Leave request approved")[0])
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/leave/me"))
  expect(hook.value.markOneRead).toHaveBeenCalledWith(2)
})

test("empty state when no items", () => {
  hook.value = { ...hook.value, items: [], unreadCount: 0 }
  render(<NotificationDropdown onNavigate={() => {}} />)
  expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
})

test("error state offers retry", () => {
  const refresh = vi.fn()
  hook.value = { ...hook.value, items: [], error: true, refresh }
  render(<NotificationDropdown onNavigate={() => {}} />)
  fireEvent.click(screen.getByRole("button", { name: /retry/i }))
  expect(refresh).toHaveBeenCalled()
})
