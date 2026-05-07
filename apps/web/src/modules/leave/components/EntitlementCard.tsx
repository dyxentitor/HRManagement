import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import type { LeaveBalance } from "../api";

function daysUntil(iso: string): number {
	const today = new Date();
	const target = new Date(`${iso}T00:00:00Z`);
	const ms = target.getTime() - today.getTime();
	return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function expiryLabel(iso: string): string {
	return `Expires ${new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})}`;
}

export function EntitlementCard({ balance }: { balance: LeaveBalance }) {
	const [expanded, setExpanded] = useState(false);

	const carried = Number(balance.carried_forward);
	const showExpiry =
		carried > 0 &&
		balance.carried_forward_expires_at !== null &&
		balance.carried_forward_expires_at !== undefined;

	const expirePalette = useMemo(() => {
		if (!showExpiry || !balance.carried_forward_expires_at) return null;
		return daysUntil(balance.carried_forward_expires_at) <= 30
			? "bg-orange-500/15 text-orange-300"
			: "bg-violet-500/15 text-violet-300";
	}, [showExpiry, balance.carried_forward_expires_at]);

	return (
		<div className="rounded-lg border border-border/50 p-4">
			<div className="mb-3 flex items-center justify-between">
				<h3 className="text-base font-medium">
					{balance.leave_type_name ?? balance.leave_type_code}
				</h3>
				<span className="text-xs text-muted-foreground">
					{balance.leave_type_code}
				</span>
			</div>
			<div className="grid grid-cols-5 gap-2 text-center">
				<div>
					<div className="text-xs text-muted-foreground">Granted</div>
					<div className="text-2xl font-medium">{balance.entitled}</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Used</div>
					<div className="text-2xl font-medium">{balance.taken}</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Pending</div>
					<div className="text-2xl font-medium">{balance.pending}</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Carried fwd</div>
					<div className="text-2xl font-medium">{balance.carried_forward}</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Available</div>
					<div className="text-2xl font-medium text-violet-300">
						{balance.available}
					</div>
				</div>
			</div>

			{showExpiry && balance.carried_forward_expires_at && expirePalette ? (
				<div className="mt-2 flex justify-end">
					<span className={`rounded-full px-2 py-0.5 text-xs ${expirePalette}`}>
						{expiryLabel(balance.carried_forward_expires_at)}
					</span>
				</div>
			) : null}

			{balance.ledger_recent && balance.ledger_recent.length > 0 ? (
				<>
					<button
						type="button"
						className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						onClick={() => setExpanded((s) => !s)}
					>
						<ChevronDown
							className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
						/>
						{expanded ? "Hide" : "Show"} recent activity
					</button>
					{expanded ? (
						<div className="mt-2 max-h-48 overflow-y-auto rounded border border-border/40">
							<table className="w-full text-xs">
								<thead className="bg-muted/30">
									<tr>
										<th className="p-1 text-left">Date</th>
										<th className="p-1 text-left">Δ</th>
										<th className="p-1 text-left">Reason</th>
										<th className="p-1 text-left">Reference</th>
									</tr>
								</thead>
								<tbody>
									{balance.ledger_recent.map((r) => (
										<tr key={r.ts}>
											<td className="p-1">{r.ts.slice(0, 10)}</td>
											<td className="p-1">{r.delta}</td>
											<td className="p-1">{r.reason}</td>
											<td className="p-1">{r.reference_type ?? "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}
				</>
			) : null}
		</div>
	);
}
