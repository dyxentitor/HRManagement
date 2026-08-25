import { type VariantProps, cva } from "class-variance-authority"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Tinted disc holding a *semantic* icon. Deliberately not a solid fill with
 * the metric repeated inside it — a circle reading "8" next to a value reading
 * "8" is noise, and it made every tile's icon slot mean something different.
 */
const circleVariants = cva(
  "size-9 rounded-full grid place-items-center shrink-0 [&>svg]:size-[18px]",
  {
    variants: {
      tone: {
        peach: "bg-peach/15 text-peach",
        lavender: "bg-lavender/15 text-lavender",
        mint: "bg-mint/15 text-mint",
        yellow: "bg-yellow/15 text-yellow",
        coral: "bg-coral/15 text-coral",
        sky: "bg-sky/15 text-sky",
      },
    },
    defaultVariants: { tone: "lavender" },
  },
)

export interface KpiTileProps extends VariantProps<typeof circleVariants> {
  label: string
  value: ReactNode
  /**
   * One line of context under the value — usually the range the figure covers.
   * The slot is reserved whether or not it is filled, so a row of tiles keeps
   * a single value baseline and a single height.
   */
  support?: string
  /** A semantic icon node. Never the value repeated back. */
  icon?: ReactNode
}

/**
 * Fixed-height metric tile. Every tile reserves the same three content areas
 * (label / value / support) so a row of them aligns regardless of how long any
 * individual label or translation runs — the label truncates rather than
 * wrapping, which is what keeps the value baseline identical across the row.
 */
export function KpiTile({ tone, label, value, support, icon }: KpiTileProps) {
  return (
    <div className="bg-surface-hover border border-border-subtle rounded-lg px-3.5 py-3 flex items-start gap-3 min-h-[84px]">
      <span className={cn(circleVariants({ tone }))} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label uppercase text-text-tertiary truncate leading-4">{label}</p>
        <p className="text-h2 text-text-primary leading-none mt-1 truncate">{value}</p>
        {/* Reserved even when empty — see `support` above. */}
        <p className="text-small text-text-secondary truncate mt-1 h-4">{support ?? ""}</p>
      </div>
    </div>
  )
}
