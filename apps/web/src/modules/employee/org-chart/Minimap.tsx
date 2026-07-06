import { type PointerEvent, useRef } from "react"

import { contentBounds, viewportRect } from "./minimap-math"
import type { NodeBox } from "./useCanvasLayout"

const PANEL_W = 148
const PANEL_H = 104
const PAD = 8

export interface MinimapProps {
  boxes: NodeBox[]
  container: { w: number; h: number }
  scale: number
  tx: number
  ty: number
  onPan: (tx: number, ty: number) => void
}

export function Minimap({ boxes, container, scale, tx, ty, onPan }: MinimapProps) {
  const ref = useRef<HTMLDivElement>(null)
  if (boxes.length <= 3) return null

  const bounds = contentBounds(boxes)
  const innerW = PANEL_W - PAD * 2
  const innerH = PANEL_H - PAD * 2
  const k = Math.min(innerW / (bounds.w || 1), innerH / (bounds.h || 1))
  const vp = viewportRect({ container, scale, tx, ty })

  // Map a click at panel coords to a pan that centres content there.
  const panToPanelPoint = (px: number, py: number) => {
    const cx = (px - PAD) / k // content x
    const cy = (py - PAD) / k
    onPan(-(cx * scale - container.w / 2), -(cy * scale - container.h / 2))
  }

  const onDown = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    panToPanelPoint(e.clientX - rect.left, e.clientY - rect.top)
  }
  const onMove = (e: PointerEvent) => {
    if (e.buttons !== 1) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    panToPanelPoint(e.clientX - rect.left, e.clientY - rect.top)
  }

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      className="absolute bottom-3 right-3 rounded-lg glass-surface border border-border-subtle cursor-pointer"
      style={{ width: PANEL_W, height: PANEL_H }}
      aria-label="Chart minimap"
    >
      <svg width={PANEL_W} height={PANEL_H} aria-hidden>
        {boxes.map((b) => (
          <rect
            key={b.id}
            x={PAD + b.x * k}
            y={PAD + b.y * k}
            width={Math.max(2, b.w * k)}
            height={Math.max(1.5, b.h * k)}
            rx={1}
            className="fill-text-tertiary/40"
          />
        ))}
        <rect
          x={PAD + vp.x * k}
          y={PAD + vp.y * k}
          width={vp.w * k}
          height={vp.h * k}
          className="fill-accent-500/10 stroke-accent-400"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
