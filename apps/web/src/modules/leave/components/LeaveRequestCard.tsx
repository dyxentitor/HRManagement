import { cn } from "@/lib/utils";
import type { LeaveRequest } from "../api";
import { formatRange } from "../lib/leave-dates";
import { TONE_BG, TONE_ICON_BG, fmtDays, stageNote, typeIcon, typeTone } from "../lib/leave-ui";
import { LeaveStepper } from "./LeaveStepper";

/** A rich, interactive leave-request card with its approval journey. */
export function LeaveRequestCard({
	request,
	onSelect,
}: {
	request: LeaveRequest;
	onSelect: (r: LeaveRequest) => void;
}) {
	const tone = typeTone(request.leave_type_code);
	const Icon = typeIcon(request.leave_type_code);
	return (
		<button
			type="button"
			onClick={() => onSelect(request)}
			className="group relative overflow-hidden glass-surface rounded-2xl p-4 text-left transition-transform duration-fast hover:-translate-y-1 focus-visible:-translate-y-1"
		>
			<span className={cn("absolute inset-x-0 top-0 h-16 opacity-10", TONE_BG[tone])} aria-hidden />
			<div className="relative flex items-start justify-between">
				<span
					className={cn("size-9 rounded-xl grid place-items-center", TONE_ICON_BG[tone])}
					aria-hidden
				>
					<Icon className="size-4.5" />
				</span>
				<span className="text-small text-text-tertiary">
					{formatRange(request.start_date, request.end_date)}
				</span>
			</div>
			<p className="relative text-2xl font-extralight tracking-tight mt-4 tabular-nums">
				{fmtDays(request.total_days)}
			</p>
			<p className="relative text-small text-text-secondary truncate">
				{request.leave_type_code} leave
			</p>
			<div className="relative mt-4">
				<LeaveStepper status={request.status} />
			</div>
			<p className="relative text-small text-text-tertiary mt-3">{stageNote(request.status)}</p>
		</button>
	);
}
