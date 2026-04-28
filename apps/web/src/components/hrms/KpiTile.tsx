import { type VariantProps, cva } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const circleVariants = cva(
	"size-9 rounded-full grid place-items-center font-bold text-h3 text-canvas shrink-0",
	{
		variants: {
			tone: {
				peach: "bg-peach",
				lavender: "bg-lavender",
				mint: "bg-mint",
				yellow: "bg-yellow",
				coral: "bg-coral",
				sky: "bg-sky",
			},
		},
		defaultVariants: { tone: "lavender" },
	},
);

export interface KpiTileProps extends VariantProps<typeof circleVariants> {
	label: string;
	value: ReactNode;
	delta?: string;
	icon?: ReactNode;
}

export function KpiTile({ tone, label, value, delta, icon }: KpiTileProps) {
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg px-3.5 py-3 flex items-center gap-2.5">
			<span className={cn(circleVariants({ tone }))} aria-hidden>
				{icon}
			</span>
			<div className="min-w-0">
				<p className="text-label text-text-tertiary truncate">{label}</p>
				<p className="text-h2 text-text-primary leading-none mt-0.5">{value}</p>
				{delta && <p className="text-small text-mint mt-0.5">{delta}</p>}
			</div>
		</div>
	);
}
