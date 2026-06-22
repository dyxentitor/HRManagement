import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/perm";

import { type LeaveBalance, leaveApi } from "@/modules/leave/api";
import { AdjustLeaveDrawer } from "./AdjustLeaveDrawer";

export function LeaveBalanceCard({ employeeId }: { employeeId: string }) {
	const canAdjust = useCan("leave:balance:adjust:org");
	const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
	const [denied, setDenied] = useState(false);
	const [drawer, setDrawer] = useState(false);

	const load = useCallback(async () => {
		try {
			setBalances(await leaveApi.balancesFor(employeeId));
			setDenied(false);
		} catch {
			// 403 (not allowed to view) or fetch error → hide the card entirely
			setDenied(true);
		}
	}, [employeeId]);

	useEffect(() => {
		void load();
	}, [load]);

	if (denied) return null;

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<header className="flex items-center justify-between mb-3">
				<h2 className="text-h3 text-text-primary">Leave &amp; Holidays</h2>
				{canAdjust && (
					<Button variant="outline" size="sm" onClick={() => setDrawer(true)}>
						Adjust leave
					</Button>
				)}
			</header>

			{balances === null ? (
				<p className="text-small text-text-tertiary">Loading…</p>
			) : balances.length === 0 ? (
				<p className="text-small text-text-tertiary">No leave balances for this year yet.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-small">
						<thead>
							<tr className="text-text-tertiary text-label uppercase text-left">
								<th className="py-1.5 pr-3">Type</th>
								<th className="py-1.5 px-2 text-right">Entitled</th>
								<th className="py-1.5 px-2 text-right">Taken</th>
								<th className="py-1.5 px-2 text-right">Pending</th>
								<th className="py-1.5 px-2 text-right">Remaining</th>
								<th className="py-1.5 pl-2 text-right">Carried</th>
							</tr>
						</thead>
						<tbody>
							{balances.map((b) => (
								<tr key={b.id} className="border-t border-border-subtle/60">
									<td className="py-1.5 pr-3 text-text-primary">
										{b.leave_type_name ?? b.leave_type_code}
									</td>
									<td className="py-1.5 px-2 text-right tabular-nums">{b.entitled}</td>
									<td className="py-1.5 px-2 text-right tabular-nums">{b.taken}</td>
									<td className="py-1.5 px-2 text-right tabular-nums">{b.pending}</td>
									<td className="py-1.5 px-2 text-right tabular-nums font-semibold text-mint">
										{b.available}
									</td>
									<td className="py-1.5 pl-2 text-right tabular-nums text-text-tertiary">
										{b.carried_forward}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{canAdjust && (
				<AdjustLeaveDrawer
					employeeId={employeeId}
					open={drawer}
					onClose={() => setDrawer(false)}
					onChanged={load}
				/>
			)}
		</section>
	);
}
