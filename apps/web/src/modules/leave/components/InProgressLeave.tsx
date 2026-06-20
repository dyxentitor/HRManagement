import { ProgressHistoryPanel, StatusPill } from "@/components/hrms";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "../api";
import { formatRange } from "../lib/leave-dates";
import {
	STATUS_TONE,
	TONE_ICON_BG,
	fmtDays,
	isInFlight,
	typeIcon,
	typeTone,
} from "../lib/leave-ui";
import { LeaveRequestCard } from "./LeaveRequestCard";

function LeaveRow({
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
			className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left border-t border-border-subtle first:border-t-0 hover:bg-surface-elevated/40"
		>
			<span
				className={cn("size-7 rounded-lg grid place-items-center shrink-0", TONE_ICON_BG[tone])}
				aria-hidden
			>
				<Icon className="size-3.5" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">
					{request.leave_type_code} · {fmtDays(request.total_days)}
				</p>
				<p className="text-[10px] text-text-tertiary">
					{formatRange(request.start_date, request.end_date)}
				</p>
			</div>
			<StatusPill tone={STATUS_TONE[request.status]} label={request.status} />
		</button>
	);
}

/** Bounded "In progress / History" section for leave requests. */
export function InProgressLeave({
	requests,
	onSelect,
}: {
	requests: LeaveRequest[];
	onSelect: (r: LeaveRequest) => void;
}) {
	return (
		<ProgressHistoryPanel
			items={requests}
			isInFlight={(r) => isInFlight(r.status)}
			getKey={(r) => r.id}
			sortValue={(r) => r.start_date ?? ""}
			cardLimit={2}
			renderCard={(r) => <LeaveRequestCard request={r} onSelect={onSelect} />}
			renderRow={(r) => <LeaveRow request={r} onSelect={onSelect} />}
			emptyInProgress="Nothing awaiting approval. You're all caught up. 🎉"
			emptyHistory="No leave requests yet — pick a type below to apply."
		/>
	);
}
