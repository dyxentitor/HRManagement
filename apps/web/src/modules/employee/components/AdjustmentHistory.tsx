import { useCallback, useEffect, useState } from "react";

import { type LeaveAdjustment, leaveApi } from "@/modules/leave/api";

/** Read-only audit trail of HR balance adjustments. */
export function AdjustmentHistory({
	employeeId,
	refreshSignal = 0,
}: {
	employeeId: string;
	refreshSignal?: number;
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

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<header className="mb-3">
				<h2 className="text-h3 text-text-primary">Adjustment history</h2>
				<p className="text-small text-text-tertiary">
					Manual balance corrections · read-only audit
				</p>
			</header>

			{rows === null ? (
				<p className="text-small text-text-tertiary">Loading…</p>
			) : rows.length === 0 ? (
				<p className="text-small text-text-tertiary">No manual adjustments yet.</p>
			) : (
				<ul className="space-y-1.5">
					{rows.map((r, i) => {
						const up = Number(r.delta) >= 0;
						return (
							<li
								key={`${r.ts}-${i}`}
								className="glass-surface rounded-xl px-3 py-2 flex items-center gap-3 text-small"
							>
								<div className="w-20 shrink-0 text-[11px] text-text-tertiary">
									{new Date(r.ts).toLocaleDateString("en-MY", {
										day: "numeric",
										month: "short",
										year: "numeric",
									})}
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-text-primary truncate">
										{r.leave_type} ·{" "}
										<span className="tabular-nums">
											{r.before} <span className="text-accent-200">→</span>{" "}
											<b className={up ? "text-mint" : "text-coral"}>{r.after}</b>
										</span>
									</p>
									{r.note && <p className="text-[11px] text-text-tertiary truncate">{r.note}</p>}
								</div>
								<div className="text-[11px] text-text-tertiary text-right shrink-0">
									<span className={up ? "text-mint" : "text-coral"}>
										{up ? "+" : ""}
										{r.delta}
									</span>
									<br />
									{r.performed_by}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
