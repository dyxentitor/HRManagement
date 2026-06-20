import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { LeaveRequest } from "../api";
import { isInFlight } from "../lib/leave-ui";
import { LeaveRequestCard } from "./LeaveRequestCard";

/** "In progress" section — rich request cards with an In progress / All toggle. */
export function InProgressLeave({
	requests,
	onSelect,
}: {
	requests: LeaveRequest[];
	onSelect: (r: LeaveRequest) => void;
}) {
	const [showAll, setShowAll] = useState(false);

	const inFlight = useMemo(() => requests.filter((r) => isInFlight(r.status)), [requests]);
	const sorted = useMemo(
		() => [...requests].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "")),
		[requests],
	);
	const shown = showAll ? sorted : inFlight;

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<p className="layer-eyebrow">
					{showAll ? "All requests" : `In progress · ${inFlight.length}`}
				</p>
				<div className="flex gap-1 text-small">
					<button
						type="button"
						onClick={() => setShowAll(false)}
						className={cn(
							"px-2.5 py-1 rounded-full",
							!showAll ? "bg-accent-500/15 text-text-primary" : "text-text-tertiary",
						)}
					>
						In progress
					</button>
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className={cn(
							"px-2.5 py-1 rounded-full",
							showAll ? "bg-accent-500/15 text-text-primary" : "text-text-tertiary",
						)}
					>
						All
					</button>
				</div>
			</div>

			{shown.length === 0 ? (
				<div className="glass-surface rounded-2xl p-8 text-center text-text-tertiary">
					{showAll
						? "No leave requests yet — pick a type below to apply."
						: "Nothing awaiting approval. You're all caught up. 🎉"}
				</div>
			) : (
				<div className="grid sm:grid-cols-2 gap-3">
					{shown.map((r) => (
						<LeaveRequestCard key={r.id} request={r} onSelect={onSelect} />
					))}
				</div>
			)}
		</section>
	);
}
