import { cn } from "@/lib/utils";

export interface LeaveSubsectionProps {
	title: string;
	description?: string;
	/** Embedded inside the Leave Management workspace → light block, no card chrome. */
	embedded?: boolean;
	right?: React.ReactNode;
	children: React.ReactNode;
}

/**
 * Shared chrome for the leave sub-sections. Standalone (view page / My Profile) it
 * renders a full card matching the employee-form sections; embedded in the workspace
 * it renders a compact block (the workspace owns the outer card + dividers).
 */
export function LeaveSubsection({
	title,
	description,
	embedded = false,
	right,
	children,
}: LeaveSubsectionProps) {
	const header = (
		<header className={cn("flex items-start justify-between gap-2", embedded ? "mb-2" : "mb-3")}>
			<div>
				<h3
					className={
						embedded ? "text-body font-semibold text-text-primary" : "text-h3 text-text-primary"
					}
				>
					{title}
				</h3>
				{description && (
					<p
						className={
							embedded ? "text-[11px] text-text-tertiary" : "text-small text-text-tertiary"
						}
					>
						{description}
					</p>
				)}
			</div>
			{right}
		</header>
	);

	if (embedded) {
		return (
			<div>
				{header}
				{children}
			</div>
		);
	}
	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			{header}
			{children}
		</section>
	);
}
