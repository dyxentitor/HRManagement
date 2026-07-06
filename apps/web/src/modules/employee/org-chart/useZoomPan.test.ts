import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useZoomPan } from "./useZoomPan"

describe("useZoomPan", () => {
  it("clamps scale to [0.4, 2]", () => {
    const { result } = renderHook(() => useZoomPan())
    act(() => {
      for (let i = 0; i < 50; i++) result.current.zoomIn()
    })
    expect(result.current.scale).toBeLessThanOrEqual(2)
    act(() => {
      for (let i = 0; i < 50; i++) result.current.zoomOut()
    })
    expect(result.current.scale).toBeGreaterThanOrEqual(0.4)
  })

  it("fit resets transform to identity", () => {
    const { result } = renderHook(() => useZoomPan())
    act(() => {
      result.current.setPan(100, 80)
      result.current.zoomIn()
    })
    act(() => result.current.fit())
    expect(result.current.scale).toBe(1)
    expect(result.current.tx).toBe(0)
    expect(result.current.ty).toBe(0)
    expect(result.current.pct).toBe(100)
  })

  it("zoomAt zooms in on negative delta", () => {
    const { result } = renderHook(() => useZoomPan())
    act(() => result.current.zoomAt(-1))
    expect(result.current.scale).toBeGreaterThan(1)
  })
})
