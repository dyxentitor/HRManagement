import { afterEach, describe, expect, it, vi } from "vitest"

import { NotificationApiError, getUnreadCount, listNotifications } from "./api"

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)

afterEach(() => vi.restoreAllMocks())

describe("notifications api", () => {
  it("getUnreadCount returns the count number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => okJson({ count: 4 })),
    )
    expect(await getUnreadCount()).toBe(4)
  })

  it("listNotifications passes before + limit in the query string", async () => {
    const fetchMock = vi.fn(() => okJson([]))
    vi.stubGlobal("fetch", fetchMock)
    await listNotifications({ before: 99, limit: 10 })
    const url = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(url).toContain("before=99")
    expect(url).toContain("limit=10")
  })

  it("throws NotificationApiError on non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)),
    )
    await expect(listNotifications()).rejects.toBeInstanceOf(NotificationApiError)
  })
})
