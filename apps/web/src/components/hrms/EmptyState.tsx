import type { ReactNode } from "react";

export interface EmptyStateProps {
	icon: ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
}: EmptyStateProps) {
	return (
		<div className="bg-surface-hover border border-dashed border-border-subtle rounded-lg p-8 text-center text-text-tertiary">
			<div
				className="size-12 rounded-full bg-accent-500/10 text-accent-200 grid place-items-center text-h2 mx-auto mb-2.5"
				aria-hidden
			>
				{icon}
			</div>
			<h3 className="text-h3 text-text-primary">{title}</h3>
			{description && <p className="text-body mt-1">{description}</p>}
			{action && <div className="mt-3">{action}</div>}
		</div>
	);
}
