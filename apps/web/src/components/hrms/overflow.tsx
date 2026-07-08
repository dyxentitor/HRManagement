import { type ReactNode, useEffect, useRef, useState } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Multi-line text that wraps + breaks unbroken strings, with Show more / less. */
export function ClampText({ text, lines = 4 }: { text: string; lines?: 3 | 4 | 6 }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el) setCanExpand(el.scrollHeight > el.clientHeight + 1)
  }, [])

  const clampClass = lines === 3 ? "line-clamp-3" : lines === 6 ? "line-clamp-6" : "line-clamp-4"
  return (
    <div>
      <p
        ref={ref}
        className={cn(
          "text-small text-text-primary whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          !expanded && clampClass,
        )}
      >
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] font-medium text-accent-200 hover:underline mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

/** Single-line value: ellipsis + tooltip with the full text on hover. */
export function TruncTip({ text, className }: { text: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("block min-w-0 truncate", className)}>{text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] break-words [overflow-wrap:anywhere]">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
