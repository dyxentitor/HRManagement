import { describe, expect, it } from "vitest"

import { categoryTone, priorityTone, statusTone } from "./announcement-meta"

describe("announcement-meta", () => {
  it("maps priorities to distinct tones", () => {
    const tones = new Set([priorityTone("low"), priorityTone("normal"), priorityTone("high")])
    expect(tones.size).toBe(3)
  })
  it("high priority is coral", () => {
    expect(priorityTone("high")).toBe("coral")
  })
  it("published status is mint", () => {
    expect(statusTone("published")).toBe("mint")
  })
  it("category tone is defined for every category", () => {
    for (const c of ["policy", "event", "maintenance", "holiday", "general"] as const) {
      expect(categoryTone(c)).toBeTruthy()
    }
  })
})
