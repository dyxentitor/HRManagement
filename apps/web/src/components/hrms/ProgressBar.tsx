import { cn } from "@/lib/utils";

export interface ProgressBarProps {
	value: number;
	max?: number;
	label?: string;
	gradient?: [string, string];
	showValue?: boolean;
	className?: string;
}

export function ProgressBar({
	value,
	max = 100,
	label,
	gradient = ["accent-500", "lavender"],
	showValue = true,
	className,
}: ProgressBarProps) {
	const clamped = Math.max(0, Math.min(value, max));
	const pct = (clamped / max) * 100;
	const [from, to] = gradient;

	return (
		<div className={className}>
			{(label || showValue) && (
				<div className="flex justify-between text-small text-text-tertiary mb-1">
					{label && <span>{label}</span>}
					{showValue && <span>{Math.round(pct)}%</span>}
				</div>
			)}
			<div className="h-1 bg-border-subtle/40 rounded-full overflow-hidden">
				<div
					role="progressbar"
					aria-valuenow={clamped}
					aria-valuemin={0}
					aria-valuemax={max}
					aria-label={label}
					className={cn(
						"h-full rounded-full bg-gradient-to-r",
						`from-${from}`,
						`to-${to}`,
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
