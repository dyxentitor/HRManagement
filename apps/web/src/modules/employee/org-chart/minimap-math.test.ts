import { describe, expect, it } from "vitest"
import { contentBounds, viewportRect } from "./minimap-math"

describe("minimap-math", () => {
  it("computes content bounds from boxes", () => {
    expect(contentBounds([{ id: "a", x: 10, y: 20, w: 100, h: 40 }])).toEqual({ w: 110, h: 60 })
  })

  it("maps the visible viewport into content coords with no transform", () => {
    const r = viewportRect({ container: { w: 400, h: 300 }, scale: 1, tx: 0, ty: 0 })
    expect(r).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })

  it("accounts for pan and zoom", () => {
    const r = viewportRect({ container: { w: 400, h: 300 }, scale: 2, tx: -100, ty: 0 })
    expect(r.x).toBe(50) // (0 - tx)/scale = 100/2
    expect(r.w).toBe(200) // container.w/scale
  })
})
