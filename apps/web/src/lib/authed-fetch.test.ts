import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  getAccess: vi.fn<() => string | null>(),
  getRefresh: vi.fn<() => string | null>(),
  set: vi.fn(),
}))
vi.mock("./token-storage", () => ({ tokenStorage: store }))

import { authedFetch } from "./authed-fetch"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("authedFetch", () => {
  beforeEach(() => {
    store.getAccess.mockReturnValue("access-old")
    store.getRefresh.mockReturnValue("refresh-1")
    store.set.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it("returns the response and does not refresh when authorized", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const r = await authedFetch("/api/v1/x")
    expect(r.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refreshes once and retries the request on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 401 })) // original
      .mockResolvedValueOnce(json({ access_token: "new", refresh_token: "r2" })) // refresh
      .mockResolvedValueOnce(new Response("ok", { status: 200 })) // retry
    vi.stubGlobal("fetch", fetchMock)
    const r = await authedFetch("/api/v1/x")
    expect(r.status).toBe(200)
    expect(store.set).toHaveBeenCalledWith("new", "r2")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("dedupes the refresh across concurrent 401s (collapses the storm)", async () => {
    let refreshCalls = 0
    store.set.mockImplementation((a: string) => store.getAccess.mockReturnValue(a))
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++
        return Promise.resolve(json({ access_token: "new", refresh_token: "r2" }))
      }
      return Promise.resolve(new Response("", { status: store.getAccess() === "new" ? 200 : 401 }))
    })
    vi.stubGlobal("fetch", fetchMock)
    const [a, b] = await Promise.all([authedFetch("/api/v1/a"), authedFetch("/api/v1/b")])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(refreshCalls).toBe(1)
  })
})
