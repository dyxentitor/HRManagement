import { useCallback, useMemo, useState } from "react"

const MIN = 0.4
const MAX = 2
const STEP = 0.1
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v))

/** Hand-rolled pan/zoom transform state for the org-chart canvas. */
export function useZoomPan() {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  const zoomIn = useCallback(() => setScale((s) => clamp(s + STEP)), [])
  const zoomOut = useCallback(() => setScale((s) => clamp(s - STEP)), [])
  const setPan = useCallback((x: number, y: number) => {
    setTx(x)
    setTy(y)
  }, [])
  const fit = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])
  // Wheel handler: scrolling up (delta < 0) zooms in.
  const zoomAt = useCallback((delta: number) => {
    setScale((s) => clamp(s + (delta < 0 ? STEP : -STEP)))
  }, [])

  const transform = useMemo(() => `translate(${tx}px, ${ty}px) scale(${scale})`, [tx, ty, scale])
  const pct = Math.round(scale * 100)

  return { scale, tx, ty, transform, pct, zoomIn, zoomOut, fit, setPan, zoomAt }
}
