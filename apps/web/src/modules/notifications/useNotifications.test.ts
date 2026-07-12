import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  dismiss: vi.fn(),
  clearAll: vi.fn(),
}))
vi.mock("./api", () => ({
  listNotifications: mocks.list,
  getUnreadCount: mocks.count,
  markRead: mocks.markRead,
  markAllRead: mocks.markAllRead,
  dismissNotification: mocks.dismiss,
  clearAll: mocks.clearAll,
  NotificationApiError: class extends Error {},
}))

import { useNotifications } from "./useNotifications"

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
  for (const f of Object.values(mocks)) f.mockReset()
  mocks.count.mockResolvedValue(2)
  mocks.list.mockResolvedValue([notif(2), notif(1)])
  mocks.markRead.mockResolvedValue(notif(2, "2026-07-06T01:00:00Z"))
  mocks.markAllRead.mockResolvedValue({ updated: 2 })
  mocks.dismiss.mockResolvedValue(undefined)
  mocks.clearAll.mockResolvedValue({ cleared: 2 })
})

describe("useNotifications", () => {
  it("loads items + unread count", async () => {
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(2)
    expect(result.current.unreadCount).toBe(2)
  })

  it("markOneRead optimistically drops the unread count", async () => {
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.markOneRead(2)
    })
    expect(result.current.items.find((n) => n.id === 2)?.read_at).not.toBeNull()
    expect(result.current.unreadCount).toBe(1)
  })

  it("sets error when the list fetch rejects", async () => {
    mocks.list.mockRejectedValueOnce(new Error("boom"))
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it("dismiss removes the row and drops the unread count", async () => {
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.dismiss(2)
    })
    expect(result.current.items.find((n) => n.id === 2)).toBeUndefined()
    expect(result.current.unreadCount).toBe(1)
    expect(mocks.dismiss).toHaveBeenCalledWith(2)
  })

  it("dismissing an already-read row leaves the unread count unchanged", async () => {
    mocks.count.mockResolvedValue(1)
    mocks.list.mockResolvedValue([notif(2), notif(1, "2026-07-06T01:00:00Z")])
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.dismiss(1)
    })
    expect(result.current.items.find((n) => n.id === 1)).toBeUndefined()
    expect(result.current.unreadCount).toBe(1)
  })

  it("clearAll empties the list and zeroes the count", async () => {
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.clearAll()
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.unreadCount).toBe(0)
    expect(mocks.clearAll).toHaveBeenCalled()
  })

  it("setFilter('unread') refetches with unreadOnly", async () => {
    const { result } = renderHook(() => useNotifications(0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    mocks.list.mockClear()
    await act(async () => {
      result.current.setFilter("unread")
    })
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ unreadOnly: true })),
    )
    expect(result.current.filter).toBe("unread")
  })
})
