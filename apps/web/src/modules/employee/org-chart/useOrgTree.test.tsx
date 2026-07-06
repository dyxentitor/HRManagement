import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useOrgTree } from "./useOrgTree"

describe("useOrgTree", () => {
  it("toggles ids on and off", () => {
    const { result } = renderHook(() => useOrgTree())
    act(() => result.current.toggle("a"))
    expect(result.current.isExpanded("a")).toBe(true)
    act(() => result.current.toggle("a"))
    expect(result.current.isExpanded("a")).toBe(false)
  })

  it("expandPath adds every id", () => {
    const { result } = renderHook(() => useOrgTree())
    act(() => result.current.expandPath(["a", "b", "c"]))
    expect(result.current.isExpanded("a")).toBe(true)
    expect(result.current.isExpanded("b")).toBe(true)
    expect(result.current.isExpanded("c")).toBe(true)
  })
})
