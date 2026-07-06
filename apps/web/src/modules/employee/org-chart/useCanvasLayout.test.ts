import { describe, expect, it } from "vitest"
import { type NodeBox, edgesFromBoxes } from "./useCanvasLayout"

describe("edgesFromBoxes", () => {
  it("pairs each child to its parent box", () => {
    const boxes: NodeBox[] = [
      { id: "root", x: 100, y: 0, w: 80, h: 40 },
      { id: "a", x: 40, y: 100, w: 80, h: 40 },
      { id: "b", x: 160, y: 100, w: 80, h: 40 },
    ]
    const edges = edgesFromBoxes(boxes, { a: "root", b: "root" })
    expect(edges).toHaveLength(2)
    expect(edges.every((e) => e.from.id === "root")).toBe(true)
    expect(edges.map((e) => e.to.id).sort()).toEqual(["a", "b"])
  })

  it("skips children whose parent box is absent", () => {
    const boxes: NodeBox[] = [{ id: "a", x: 0, y: 0, w: 10, h: 10 }]
    expect(edgesFromBoxes(boxes, { a: "missing" })).toEqual([])
  })
})
