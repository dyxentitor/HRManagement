import { Button } from "@/components/ui/button";

export function StepHeader({
	n,
	title,
	subtitle,
}: {
	n: string;
	title: string;
	subtitle?: string;
}) {
	return (
		<header className="mb-6">
			<p className="layer-eyebrow">{n}</p>
			<h2 className="text-2xl font-extralight tracking-tight mt-1">{title}</h2>
			{subtitle && <p className="text-small text-text-secondary mt-1 max-w-md">{subtitle}</p>}
		</header>
	);
}

/** Sticky-feeling footer with Back / optional Skip / primary action. */
export function StepFooter({
	onBack,
	primaryLabel,
	onPrimary,
	primaryDisabled,
	secondaryLabel,
	onSecondary,
}: {
	onBack?: () => void;
	primaryLabel: string;
	onPrimary: () => void;
	primaryDisabled?: boolean;
	secondaryLabel?: string;
	onSecondary?: () => void;
}) {
	return (
		<>
			<div className="flex-1" />
			<div className="flex items-center justify-between gap-3 mt-8 pt-4 border-t border-border-subtle">
				{onBack ? (
					<button
						type="button"
						onClick={onBack}
						className="text-small text-text-secondary hover:text-text-primary"
					>
						← Back
					</button>
				) : (
					<span />
				)}
				<div className="flex items-center gap-3">
					{secondaryLabel && onSecondary && (
						<button
							type="button"
							onClick={onSecondary}
							className="text-small text-text-tertiary hover:text-text-secondary"
						>
							{secondaryLabel}
						</button>
					)}
					<Button onClick={onPrimary} disabled={primaryDisabled} className="soft-glow">
						{primaryLabel}
					</Button>
				</div>
			</div>
		</>
	);
}
