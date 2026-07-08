import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  approveItem: vi.fn().mockResolvedValue(undefined),
  rejectItem: vi.fn().mockResolvedValue(undefined),
  coverage: vi.fn().mockResolvedValue({ per_day: {}, people: [] }),
}))

vi.mock("./api", () => ({
  getInbox: mocks.getInbox,
  approveItem: mocks.approveItem,
  rejectItem: mocks.rejectItem,
}))
vi.mock("@/modules/leave/api", () => ({ leaveApi: { coverage: mocks.coverage } }))

import { useApprovalInbox } from "./useApprovalInbox"

const item = (over: Record<string, unknown>) => ({
  kind: "claim",
  id: "1",
  employee_code: "E1",
  summary: "",
  submitted_at: null,
  deep_link: "",
  employee_id: "e1",
  name: "X",
  department: "",
  type_code: "",
  detail: {},
  ...over,
})

describe("useApprovalInbox", () => {
  it("loads items and clears selection", async () => {
    mocks.getInbox.mockResolvedValueOnce([item({ id: "a" }), item({ id: "b", kind: "leave" })])
    const { result } = renderHook(() => useApprovalInbox())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(2)
  })

  it("approveIds calls approveItem per id", async () => {
    mocks.getInbox.mockResolvedValue([item({ id: "a" }), item({ id: "b" })])
    const { result } = renderHook(() => useApprovalInbox())
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    await act(async () => {
      await result.current.approveIds(["a", "b"])
    })
    expect(mocks.approveItem).toHaveBeenCalledTimes(2)
  })

  it("reject requires a comment", async () => {
    mocks.getInbox.mockResolvedValue([item({ id: "a" })])
    const { result } = renderHook(() => useApprovalInbox())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await expect(result.current.reject(item({ id: "a" }) as never, "  ")).rejects.toThrow(
      /comment/i,
    )
  })
})
