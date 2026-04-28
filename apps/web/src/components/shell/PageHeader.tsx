import type { ReactNode } from "react";

interface PageHeaderProps {
	title: string;
	subtitle?: string;
	breadcrumb?: string;
	actions?: ReactNode;
}

export function PageHeader({
	title,
	subtitle,
	breadcrumb,
	actions,
}: PageHeaderProps) {
	return (
		<header className="flex items-end justify-between gap-4 pb-2">
			<div>
				{breadcrumb && (
					<p className="text-small text-text-tertiary">{breadcrumb}</p>
				)}
				<h1 className="text-h1 text-text-primary mt-0.5">{title}</h1>
				{subtitle && (
					<p className="text-small text-text-secondary mt-1">{subtitle}</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</header>
	);
}
