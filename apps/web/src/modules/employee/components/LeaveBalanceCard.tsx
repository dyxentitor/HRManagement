import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { type LeaveBalance, leaveApi } from "@/modules/leave/api";

const TONES = ["bg-mint", "bg-sky", "bg-lavender", "bg-peach", "bg-yellow", "bg-coral"];
const TEXT_TONES = [
	"text-mint",
	"text-sky",
	"text-lavender",
	"text-peach",
	"text-yellow",
	"text-coral",
];

/** Read-only leave/holiday balances. No edit affordances — viewing only. */
export function LeaveBalanceCard({ employeeId }: { employeeId: string }) {
	const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
	const [denied, setDenied] = useState(false);

	const load = useCallback(async () => {
		try {
			setBalances(await leaveApi.balancesFor(employeeId));
			setDenied(false);
		} catch {
			setDenied(true); // 403 / error → hide the card entirely
		}
	}, [employeeId]);

	useEffect(() => {
		void load();
	}, [load]);

	if (denied) return null;

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<header className="mb-3">
				<h2 className="text-h3 text-text-primary">Leave &amp; Holidays</h2>
				<p className="text-small text-text-tertiary">
					Remaining balance · {new Date().getFullYear()}
				</p>
			</header>

			{balances === null ? (
				<p className="text-small text-text-tertiary">Loading…</p>
			) : balances.length === 0 ? (
				<p className="text-small text-text-tertiary">No leave balances for this year yet.</p>
			) : (
				<ul className="space-y-2.5">
					{balances.map((b, i) => {
						const remaining = Number(b.available);
						const entitled = Number(b.entitled) || Number(b.accrued) || 0;
						const pct = entitled > 0 ? Math.max(0, Math.min(100, (remaining / entitled) * 100)) : 0;
						const noCap = entitled <= 0;
						return (
							<li key={b.id} className="flex items-center gap-3">
								<div className="w-28 min-w-0">
									<p className="text-small text-text-primary truncate">
										{b.leave_type_name ?? b.leave_type_code}
									</p>
									<p className="text-[10px] text-text-tertiary">
										{Number(b.taken)} taken
										{Number(b.pending) > 0 ? ` · ${Number(b.pending)} pending` : ""}
									</p>
								</div>
								<div className="flex-1 h-1.5 rounded-full bg-surface-elevated/60 overflow-hidden">
									{!noCap && (
										<div
											className={cn("h-full rounded-full", TONES[i % TONES.length])}
											style={{ width: `${pct}%` }}
										/>
									)}
								</div>
								<div className="w-16 text-right tabular-nums text-small">
									{noCap ? (
										<span className="text-text-tertiary text-[11px]">no cap</span>
									) : (
										<>
											<b className={TEXT_TONES[i % TEXT_TONES.length]}>{remaining}</b>
											<span className="text-text-tertiary">/{entitled}</span>
										</>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
