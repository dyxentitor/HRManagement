import { useCallback, useRef, useState } from "react"

export interface NodeBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface Edge {
  from: NodeBox
  to: NodeBox
}

/** Pair each child box to its parent box (content-layer coordinates). */
export function edgesFromBoxes(boxes: NodeBox[], parentOf: Record<string, string>): Edge[] {
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const edges: Edge[] = []
  for (const child of boxes) {
    const parentId = parentOf[child.id]
    const parent = parentId ? byId.get(parentId) : undefined
    if (parent) edges.push({ from: parent, to: child })
  }
  return edges
}

/**
 * Collect layout boxes for registered node elements, relative to the content
 * layer. Uses offsetLeft/Top which are unaffected by an ancestor CSS transform,
 * so pan/zoom never distorts the geometry.
 */
export function useCanvasLayout() {
  const els = useRef(new Map<string, HTMLElement>())
  const [boxes, setBoxes] = useState<NodeBox[]>([])

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el)
    else els.current.delete(id)
  }, [])

  const recompute = useCallback(() => {
    const next: NodeBox[] = []
    for (const [id, el] of els.current) {
      next.push({ id, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    }
    setBoxes(next)
  }, [])

  return { register, boxes, recompute }
}
