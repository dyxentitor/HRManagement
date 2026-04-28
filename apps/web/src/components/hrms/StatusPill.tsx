import { type VariantProps, cva } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const pillVariants = cva(
	"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-small font-semibold",
	{
		variants: {
			tone: {
				mint: "bg-mint/15 text-mint",
				yellow: "bg-yellow/15 text-yellow",
				coral: "bg-coral/15 text-coral",
				sky: "bg-sky/15 text-sky",
				lavender: "bg-lavender/15 text-lavender",
				peach: "bg-peach/15 text-peach",
			},
		},
		defaultVariants: { tone: "lavender" },
	},
);

export interface StatusPillProps extends VariantProps<typeof pillVariants> {
	label: string;
	icon?: ReactNode;
	className?: string;
}

export function StatusPill({ tone, label, icon, className }: StatusPillProps) {
	return (
		<span className={cn(pillVariants({ tone }), className)}>
			{icon && <span aria-hidden>{icon}</span>}
			<span>{label}</span>
		</span>
	);
}
