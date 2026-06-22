import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { type LeaveBalance, leaveApi } from "@/modules/leave/api";
import { LeaveSubsection } from "./LeaveSubsection";

const TONES = ["bg-mint", "bg-sky", "bg-lavender", "bg-peach", "bg-yellow", "bg-coral"];
const TEXT = ["text-mint", "text-sky", "text-lavender", "text-peach", "text-yellow", "text-coral"];

/** Read-only leave/holiday balances — Allocated · Used · Remaining + progress. */
export function LeaveBalanceCard({
	employeeId,
	refreshSignal = 0,
	embedded = false,
}: {
	employeeId: string;
	/** Bump to force a refetch (e.g. after an adjustment). */
	refreshSignal?: number;
	embedded?: boolean;
}) {
	const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
	const [denied, setDenied] = useState(false);

	const load = useCallback(async () => {
		try {
			setBalances(await leaveApi.balancesFor(employeeId));
			setDenied(false);
		} catch {
			setDenied(true);
		}
	}, [employeeId]);

	useEffect(() => {
		void load();
	}, [load, refreshSignal]);

	if (denied) return null;

	return (
		<LeaveSubsection
			embedded={embedded}
			title="Current balance"
			description={`Leave & Holidays · ${new Date().getFullYear()}`}
		>
			{balances === null ? (
				<p className="text-small text-text-tertiary">Loading…</p>
			) : balances.length === 0 ? (
				<p className="text-small text-text-tertiary">No leave balances for this year yet.</p>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{balances.map((b, i) => {
						const allocated = Number(b.accrued) + Number(b.carried_forward);
						const used = Number(b.taken);
						const pending = Number(b.pending);
						const remaining = Number(b.available);
						const noCap = allocated <= 0;
						const usedPct = noCap ? 0 : Math.min(100, (used / allocated) * 100);
						const pendPct = noCap ? 0 : Math.min(100 - usedPct, (pending / allocated) * 100);
						return (
							<div key={b.id} className="glass-surface rounded-xl p-3">
								<div className="flex items-baseline justify-between">
									<span className="text-small text-text-primary font-medium">
										{b.leave_type_name ?? b.leave_type_code}
									</span>
									<span className="tabular-nums text-small">
										{noCap ? (
											<span className="text-text-tertiary text-[11px]">no cap</span>
										) : (
											<>
												<b className={TEXT[i % TEXT.length]}>{remaining}</b>
												<span className="text-text-tertiary text-[11px]"> left</span>
											</>
										)}
									</span>
								</div>
								<div className="my-2 h-2 rounded-full bg-surface-elevated/60 overflow-hidden flex">
									<div
										className={cn("h-full", TONES[i % TONES.length])}
										style={{ width: `${usedPct}%` }}
									/>
									<div className="h-full bg-yellow/50" style={{ width: `${pendPct}%` }} />
								</div>
								<div className="flex justify-between text-[11px] text-text-tertiary tabular-nums">
									<span>{noCap ? "—" : `${allocated} allocated`}</span>
									<span>
										{used} used{pending > 0 ? ` · ${pending} pending` : ""}
									</span>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</LeaveSubsection>
	);
}
