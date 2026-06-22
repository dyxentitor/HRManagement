import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { type LeaveBalance, leaveApi } from "@/modules/leave/api";
import { LeaveSubsection } from "./LeaveSubsection";

const TONES = ["bg-mint", "bg-sky", "bg-lavender", "bg-peach", "bg-yellow", "bg-coral"];
const TEXT = ["text-mint", "text-sky", "text-lavender", "text-peach", "text-yellow", "text-coral"];
const RING = [
	"border-mint/30 from-mint/10",
	"border-sky/30 from-sky/10",
	"border-lavender/30 from-lavender/10",
	"border-peach/30 from-peach/10",
	"border-yellow/30 from-yellow/10",
	"border-coral/30 from-coral/10",
];

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
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{balances.map((b, i) => {
						const allocated = Number(b.accrued) + Number(b.carried_forward);
						const used = Number(b.taken);
						const pending = Number(b.pending);
						const remaining = Number(b.available);
						const noCap = allocated <= 0;
						const usedPct = noCap ? 0 : Math.min(100, (used / allocated) * 100);
						const pendPct = noCap ? 0 : Math.min(100 - usedPct, (pending / allocated) * 100);
						return (
							<div
								key={b.id}
								className={cn(
									"rounded-xl p-3.5 border bg-gradient-to-b to-transparent",
									RING[i % RING.length],
								)}
							>
								<p className="text-small text-text-secondary font-medium truncate">
									{b.leave_type_name ?? b.leave_type_code}
								</p>
								<p className="mt-1 mb-2 tabular-nums leading-none">
									{noCap ? (
										<span className="text-2xl font-extralight text-text-secondary">∞</span>
									) : (
										<>
											<span className={cn("text-3xl font-extralight", TEXT[i % TEXT.length])}>
												{remaining}
											</span>
											<span className="text-small text-text-tertiary"> remaining</span>
										</>
									)}
								</p>
								<div className="h-1.5 rounded-full bg-surface-elevated/60 overflow-hidden flex">
									<div
										className={cn("h-full", TONES[i % TONES.length])}
										style={{ width: `${usedPct}%` }}
									/>
									<div className="h-full bg-yellow/50" style={{ width: `${pendPct}%` }} />
								</div>
								<div className="flex justify-between text-[11px] text-text-tertiary tabular-nums mt-1.5">
									<span>{noCap ? "no cap" : `${allocated} allocated`}</span>
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
