import type { NodeBox } from "./useCanvasLayout"

export function contentBounds(boxes: NodeBox[]): { w: number; h: number } {
  let w = 0
  let h = 0
  for (const b of boxes) {
    w = Math.max(w, b.x + b.w)
    h = Math.max(h, b.y + b.h)
  }
  return { w, h }
}

export interface ViewportInput {
  container: { w: number; h: number }
  scale: number
  tx: number
  ty: number
}

/** Visible region in content coordinates given the pan/zoom transform. */
export function viewportRect({ container, scale, tx, ty }: ViewportInput) {
  return {
    x: -tx / scale + 0, // + 0 normalizes -0 to +0
    y: -ty / scale + 0,
    w: container.w / scale,
    h: container.h / scale,
  }
}
