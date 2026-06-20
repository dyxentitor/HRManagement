import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface WidgetCardProps {
	title: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}

/** Shared surface for dashboard body widgets — consistent header + padding. */
export function WidgetCard({ title, action, children, className }: WidgetCardProps) {
	return (
		<section
			className={cn(
				"bg-surface-hover border border-border-subtle rounded-lg p-4",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2 mb-3">
				<h3 className="text-label font-semibold text-text-secondary">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}
