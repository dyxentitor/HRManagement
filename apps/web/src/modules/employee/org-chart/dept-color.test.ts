import { describe, expect, it } from "vitest"
import { departmentTone } from "./dept-color"

describe("departmentTone", () => {
  it("is deterministic", () => {
    expect(departmentTone("Engineering")).toBe(departmentTone("Engineering"))
  })
  it("maps null and undefined to the same stable fallback", () => {
    expect(departmentTone(null)).toBe(departmentTone(undefined))
  })
  it("returns a known pastel tone", () => {
    const tones = ["lavender", "sky", "yellow", "mint", "peach", "coral"]
    expect(tones).toContain(departmentTone("Sales"))
    expect(tones).toContain(departmentTone("Engineering"))
  })
})
