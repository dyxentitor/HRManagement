import { StatusPill } from "@/components/hrms";
import {
	ClockInOutWidget,
	type ClockState,
} from "@/components/hrms/ClockInOutWidget";
import { cn } from "@/lib/utils";

import { TONE_DOT } from "../lib/shift-tone";
import type { DayShift } from "./ScheduleDayCard";

type PillTone = "mint" | "yellow" | "coral" | "peach";

export interface ScheduleTodayHeroProps {
	dateLabel: string;
	statusLabel: string;
	statusTone: PillTone;
	clockState: ClockState;
	isHolidayWork: boolean;
	holidayName: string | null;
	shift: DayShift | null;
	busy: boolean;
	onClockIn: () => void;
	onClockOut: () => void;
	/** Gated on the `attendance:clock:self` permission — hides the clock in/out control when false. */
	canClock?: boolean;
}

export function ScheduleTodayHero(props: ScheduleTodayHeroProps) {
	const {
		dateLabel,
		statusLabel,
		statusTone,
		clockState,
		isHolidayWork,
		holidayName,
		shift,
		busy,
		onClockIn,
		onClockOut,
		canClock = true,
	} = props;

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<div className={cn("grid gap-4", canClock && "md:grid-cols-[1fr_18rem] md:items-center")}>
				<div className="space-y-2">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-label uppercase text-text-tertiary">
							Today · {dateLabel}
						</span>
						<StatusPill tone={statusTone} label={statusLabel} />
						{isHolidayWork && (
							<span className="text-small text-peach">• Holiday work</span>
						)}
					</div>
					{shift ? (
						<div className="flex items-center gap-2 flex-wrap">
							<span
								className={cn("size-3 rounded-full shrink-0", TONE_DOT[shift.tone])}
								aria-hidden
							/>
							<span className="text-h2 text-text-primary">{shift.name}</span>
							{shift.timeRange && (
								<span className="font-mono text-body text-text-secondary">
									{shift.timeRange}
								</span>
							)}
						</div>
					) : (
						<p className="text-body text-text-secondary">
							{holidayName
								? `Public holiday — ${holidayName}`
								: "No shift scheduled today"}
						</p>
					)}
				</div>
				{canClock && (
					<ClockInOutWidget
						state={clockState}
						onClockIn={onClockIn}
						onClockOut={onClockOut}
						busy={busy}
					/>
				)}
			</div>
		</section>
	);
}
