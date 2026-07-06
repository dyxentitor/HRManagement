export interface ConnectorEdge {
  from: DOMRect
  to: DOMRect
}

/** Absolutely-positioned SVG overlay drawing elbow lines parent→child. */
export function Connectors({
  edges,
  containerRect,
}: {
  edges: ConnectorEdge[]
  containerRect: DOMRect
}) {
  const path = (e: ConnectorEdge) => {
    const x1 = e.from.left - containerRect.left + e.from.width / 2
    const y1 = e.from.bottom - containerRect.top
    const x2 = e.to.left - containerRect.left + e.to.width / 2
    const y2 = e.to.top - containerRect.top
    const midY = (y1 + y2) / 2
    return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`
  }
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      <title>Reporting connectors</title>
      {edges.map((e, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: edges are positional, no stable id
          key={i}
          d={path(e)}
          className="stroke-border-subtle"
          strokeWidth={1.5}
          fill="none"
        />
      ))}
    </svg>
  )
}
