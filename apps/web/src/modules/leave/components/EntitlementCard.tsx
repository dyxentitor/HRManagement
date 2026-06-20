import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { LeaveBalance } from "../api";
import { daysUntil } from "../lib/leave-dates";

function expiryLabel(iso: string): string {
	return `Expires ${new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	})}`;
}

const STATS: { key: keyof LeaveBalance; label: string; accent?: boolean }[] = [
	{ key: "entitled", label: "Granted" },
	{ key: "taken", label: "Used" },
	{ key: "pending", label: "Pending" },
	{ key: "carried_forward", label: "Carried fwd" },
	{ key: "available", label: "Available", accent: true },
];

export function EntitlementCard({ balance }: { balance: LeaveBalance }) {
	const [expanded, setExpanded] = useState(false);

	const carried = Number(balance.carried_forward);
	const showExpiry =
		carried > 0 &&
		balance.carried_forward_expires_at !== null &&
		balance.carried_forward_expires_at !== undefined;

	const expireClass = useMemo(() => {
		if (!showExpiry || !balance.carried_forward_expires_at) return null;
		return daysUntil(balance.carried_forward_expires_at) <= 30
			? "bg-yellow/15 text-yellow"
			: "bg-accent-500/15 text-accent-200";
	}, [showExpiry, balance.carried_forward_expires_at]);

	return (
		<div className="rounded-lg border border-border-subtle bg-surface-hover p-4">
			<div className="mb-3 flex items-center justify-between">
				<h3 className="text-h3 text-text-primary">
					{balance.leave_type_name ?? balance.leave_type_code}
				</h3>
				<span className="text-small text-text-tertiary">{balance.leave_type_code}</span>
			</div>
			<div className="grid grid-cols-5 gap-2 text-center">
				{STATS.map((s) => (
					<div key={s.key as string}>
						<div className="text-small text-text-tertiary">{s.label}</div>
						<div
							className={cn(
								"text-h2 leading-none mt-1",
								s.accent ? "text-accent-200" : "text-text-primary",
							)}
						>
							{balance[s.key] as string}
						</div>
					</div>
				))}
			</div>

			{showExpiry && balance.carried_forward_expires_at && expireClass ? (
				<div className="mt-2 flex justify-end">
					<span className={cn("rounded-full px-2 py-0.5 text-small", expireClass)}>
						{expiryLabel(balance.carried_forward_expires_at)}
					</span>
				</div>
			) : null}

			{balance.ledger_recent && balance.ledger_recent.length > 0 ? (
				<>
					<button
						type="button"
						className="mt-3 flex items-center gap-1 text-small text-text-tertiary hover:text-text-secondary"
						onClick={() => setExpanded((s) => !s)}
					>
						<ChevronDown
							className={cn("size-3 transition-transform", expanded && "rotate-180")}
						/>
						{expanded ? "Hide" : "Show"} recent activity
					</button>
					{expanded ? (
						<div className="mt-2 max-h-48 overflow-y-auto rounded border border-border-subtle">
							<table className="w-full text-small">
								<thead className="bg-surface-hover">
									<tr className="text-text-tertiary">
										<th className="p-1.5 text-left font-medium">Date</th>
										<th className="p-1.5 text-left font-medium">Δ</th>
										<th className="p-1.5 text-left font-medium">Reason</th>
										<th className="p-1.5 text-left font-medium">Reference</th>
									</tr>
								</thead>
								<tbody className="text-text-secondary">
									{balance.ledger_recent.map((r) => (
										<tr key={r.ts}>
											<td className="p-1.5">{r.ts.slice(0, 10)}</td>
											<td className="p-1.5 tabular-nums">{r.delta}</td>
											<td className="p-1.5">{r.reason}</td>
											<td className="p-1.5">{r.reference_type ?? "—"}</td>
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
