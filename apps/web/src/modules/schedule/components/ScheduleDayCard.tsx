import { cn } from "@/lib/utils";

import type { Tone } from "../lib/cell-tone";
import { TONE_DOT } from "../lib/shift-tone";
import { weekdayLabel } from "../lib/weekday";

export interface DayShift {
	name: string;
	tone: Tone;
	timeRange: string;
	isCoverUp: boolean;
	coveringForName: string | null;
	isDraft: boolean;
}

export interface ScheduleDayCardProps {
	date: string;
	isToday: boolean;
	isWeekend: boolean;
	holidayName?: string | null;
	shift?: DayShift | null;
	/** Supplied only for future, published shifts the viewer owns. */
	onRequestSwap?: () => void;
}

export function ScheduleDayCard({
	date,
	isToday,
	isWeekend,
	holidayName = null,
	shift = null,
	onRequestSwap,
}: ScheduleDayCardProps) {
	const dayNum = new Date(`${date}T00:00:00Z`).getUTCDate();
	return (
		<div
			className={cn(
				"rounded-lg border p-3 min-h-[5.5rem] flex flex-col gap-1.5 bg-surface-hover",
				isToday
					? "border-accent-500 ring-1 ring-accent-500/40"
					: "border-border-subtle",
				isWeekend && !holidayName && !isToday && "bg-surface-elevated",
			)}
		>
			<div className="flex items-center justify-between">
				<span
					className={cn(
						"text-label uppercase",
						holidayName ? "text-peach" : "text-text-tertiary",
					)}
				>
					{weekdayLabel(date, "short")} {dayNum}
				</span>
				{isToday && (
					<span className="text-[10px] uppercase font-semibold text-accent-200 bg-accent-500/15 px-1.5 rounded">
						Today
					</span>
				)}
				{holidayName && !isToday && (
					<span title={holidayName} className="text-peach" aria-hidden>
						●
					</span>
				)}
			</div>

			{shift ? (
				<div className="flex flex-col gap-0.5">
					<div className="flex items-center gap-1.5">
						<span
							className={cn(
								"size-2.5 rounded-full shrink-0",
								TONE_DOT[shift.tone],
							)}
							aria-hidden
						/>
						<span className="text-body text-text-primary font-medium truncate">
							{shift.name}
						</span>
						{shift.isDraft && (
							<span
								title="Draft (unpublished)"
								className="size-1.5 rounded-full bg-coral shrink-0"
								aria-hidden
							/>
						)}
					</div>
					{shift.timeRange && (
						<span className="font-mono text-small text-text-secondary">
							{shift.timeRange}
						</span>
					)}
					{shift.isCoverUp && (
						<span className="text-xs text-coral truncate">
							⤴ Covering {shift.coveringForName ?? ""}
						</span>
					)}
				</div>
			) : holidayName ? (
				<span className="text-small text-peach">Public holiday</span>
			) : (
				<span className="text-small text-text-tertiary">Off</span>
			)}

			{shift && onRequestSwap && (
				<button
					type="button"
					onClick={onRequestSwap}
					className="mt-auto text-left text-label uppercase text-accent-200 hover:text-accent-100"
				>
					Request swap
				</button>
			)}
		</div>
	);
}
