import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { type LeaveAdjustment, leaveApi } from "@/modules/leave/api";
import { LeaveSubsection } from "./LeaveSubsection";

function bucketOf(ts: string): string {
	const d = new Date(ts);
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const dayMs = 86_400_000;
	const diffDays = Math.floor((startOfToday.getTime() - d.getTime()) / dayMs);
	if (d >= startOfToday) return "Today";
	if (diffDays < 1) return "Yesterday";
	if (diffDays < 7) return "This week";
	if (diffDays < 30) return "This month";
	return "Earlier";
}

const BUCKET_ORDER = ["Today", "Yesterday", "This week", "This month", "Earlier"];

/** Read-only timeline of HR balance adjustments. */
export function AdjustmentHistory({
	employeeId,
	refreshSignal = 0,
	embedded = false,
}: {
	employeeId: string;
	refreshSignal?: number;
	embedded?: boolean;
}) {
	const [rows, setRows] = useState<LeaveAdjustment[] | null>(null);

	const load = useCallback(async () => {
		try {
			setRows(await leaveApi.adjustmentHistory(employeeId));
		} catch {
			setRows([]);
		}
	}, [employeeId]);

	useEffect(() => {
		void load();
	}, [load, refreshSignal]);

	const groups = new Map<string, LeaveAdjustment[]>();
	for (const r of rows ?? []) {
		const b = bucketOf(r.ts);
		(groups.get(b) ?? groups.set(b, []).get(b))?.push(r);
	}

	return (
		<LeaveSubsection
			embedded={embedded}
			title="Adjustment history"
			description="Manual balance corrections · read-only audit trail."
		>
			{rows === null ? (
				<p className="text-small text-text-tertiary">Loading…</p>
			) : rows.length === 0 ? (
				<p className="text-small text-text-tertiary">No manual adjustments yet.</p>
			) : (
				<div className="space-y-4">
					{BUCKET_ORDER.filter((b) => groups.has(b)).map((bucket) => (
						<div key={bucket}>
							<p className="layer-eyebrow mb-2">{bucket}</p>
							<ul className="relative ml-1.5 border-l border-border-subtle space-y-3 pl-4">
								{(groups.get(bucket) ?? []).map((r, i) => {
									const up = Number(r.delta) >= 0;
									return (
										<li key={`${r.ts}-${i}`} className="relative">
											<span
												className={cn(
													"absolute -left-[1.32rem] top-1 size-2.5 rounded-full ring-2 ring-surface",
													up ? "bg-mint" : "bg-coral",
												)}
												aria-hidden
											/>
											<div className="flex items-baseline justify-between gap-2">
												<span className="text-small text-text-primary">
													<b className={up ? "text-mint" : "text-coral"}>
														{up ? "+" : ""}
														{r.delta}
													</b>{" "}
													{r.leave_type}{" "}
													<span className="tabular-nums text-text-tertiary text-[11px]">
														({r.before} → {r.after})
													</span>
												</span>
												<span className="text-[11px] text-text-tertiary shrink-0">
													{new Date(r.ts).toLocaleDateString("en-MY", {
														day: "numeric",
														month: "short",
													})}
												</span>
											</div>
											<p className="text-[11px] text-text-tertiary">
												{r.note ? `${r.note} · ` : ""}
												{r.performed_by}
											</p>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</div>
			)}
		</LeaveSubsection>
	);
}
