import { Maximize, Minus, Plus } from "lucide-react"

export interface CanvasControlsProps {
  pct: number
  onIn: () => void
  onOut: () => void
  onFit: () => void
}

/** Floating glass zoom cluster for the bottom-left of the canvas. */
export function CanvasControls({ pct, onIn, onOut, onFit }: CanvasControlsProps) {
  return (
    <div className="absolute bottom-3 left-3 inline-flex items-center gap-0.5 glass-surface border border-border-subtle rounded-full px-1.5 py-1">
      <button
        type="button"
        aria-label="Zoom out"
        onClick={onOut}
        className="size-7 grid place-items-center rounded-full text-text-secondary hover:bg-surface-elevated/60"
      >
        <Minus className="size-4" />
      </button>
      <span className="text-[11px] text-text-tertiary w-10 text-center tabular-nums">{pct}%</span>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={onIn}
        className="size-7 grid place-items-center rounded-full text-text-secondary hover:bg-surface-elevated/60"
      >
        <Plus className="size-4" />
      </button>
      <span className="w-px h-4 bg-border-subtle mx-0.5" />
      <button
        type="button"
        aria-label="Fit to view"
        onClick={onFit}
        className="size-7 grid place-items-center rounded-full text-text-secondary hover:bg-surface-elevated/60"
      >
        <Maximize className="size-4" />
      </button>
    </div>
  )
}
