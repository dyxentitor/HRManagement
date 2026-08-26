import { afterEach, describe, expect, it, vi } from "vitest"

// Hoist the mock fn so vi.mock factory can reference it (vi.mock is hoisted to
// top-of-file by Vitest; variables defined after the import block are not yet
// in scope at that point).
const mocks = vi.hoisted(() => ({
  authedFetch: vi.fn(),
}))

// Mock authedFetch so tests run without a real server or token storage.
// We exercise the URL-building and error-message-extraction logic directly.
vi.mock("@/lib/authed-fetch", () => ({ authedFetch: mocks.authedFetch }))

import { createSwapRequest, listSwapCandidates } from "./swap-api"

const jsonResp = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response

afterEach(() => vi.clearAllMocks())

describe("swap-api", () => {
  it("passes assignment_id when listing candidates", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      jsonResp({ results: [{ id: "c1" }], count: 1, page: 1, page_size: 8, blocked_reason: null }),
    )

    const data = await listSwapCandidates({ assignmentId: "a1" })

    const calledUrl = String(mocks.authedFetch.mock.calls[0][0])
    expect(calledUrl).toContain("assignment_id=a1")
    expect(data.results).toHaveLength(1)
    expect(data.count).toBe(1)
  })

  it("forwards search, filters and paging to the server", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      jsonResp({ results: [], count: 0, page: 2, page_size: 8, blocked_reason: null }),
    )

    await listSwapCandidates({
      assignmentId: "a1",
      q: "Esther",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      shift: "s-day",
      page: 2,
      pageSize: 8,
    })

    const url = String(mocks.authedFetch.mock.calls[0][0])
    expect(url).toContain("q=Esther")
    expect(url).toContain("date_from=2026-09-01")
    expect(url).toContain("date_to=2026-09-30")
    expect(url).toContain("shift=s-day")
    expect(url).toContain("page=2")
    expect(url).toContain("page_size=8")
  })

  it("omits filters that are unset, rather than sending empty values", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      jsonResp({ results: [], count: 0, page: 1, page_size: 8, blocked_reason: null }),
    )

    await listSwapCandidates({ assignmentId: "a1", q: "", dateFrom: undefined })

    const url = String(mocks.authedFetch.mock.calls[0][0])
    expect(url).not.toContain("q=")
    expect(url).not.toContain("date_from=")
  })

  it("surfaces the RFC 7807 detail message on a rejected swap", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      jsonResp({ detail: "E1 is already rostered on 2026-09-03 (Day). Swap not possible." }, 400),
    )

    await expect(
      createSwapRequest({
        requesterAssignmentId: "a1",
        counterpartyAssignmentId: "a2",
        reason: "",
      }),
    ).rejects.toThrow(/already rostered on 2026-09-03/)
  })

  it("sends POST with snake_case body", async () => {
    mocks.authedFetch.mockResolvedValueOnce(jsonResp({ id: "sr1", status: "pending" }))

    await createSwapRequest({
      requesterAssignmentId: "assign-aaa",
      counterpartyAssignmentId: "assign-bbb",
      reason: "covering for leave",
    })

    const [calledUrl, calledInit] = mocks.authedFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/schedule/swap-requests/`,
    )
    expect(calledInit.method).toBe("POST")
    const body = JSON.parse(calledInit.body as string)
    expect(body).toEqual({
      requester_assignment: "assign-aaa",
      counterparty_assignment: "assign-bbb",
      reason: "covering for leave",
    })
  })
})
