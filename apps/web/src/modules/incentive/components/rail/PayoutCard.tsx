import { cn } from "@/lib/utils";

import type { MePayout } from "../../api";
import { md, rm } from "../format";

const NODES = [
	{ key: "approved", label: "Approved" },
	{ key: "in_payroll", label: "In payroll" },
	{ key: "paid", label: "Paid" },
] as const;

/** This quarter's payout as an Approved -> In payroll -> Paid flow. */
export function PayoutCard({ payout }: { payout: MePayout }) {
	// Current stage = the earliest node that still has claims sitting in it.
	const stage =
		payout.pending_ct > 0
			? "approved"
			: payout.in_payroll_ct > 0
				? "in_payroll"
				: payout.paid_ct > 0
					? "paid"
					: "approved";
	const reached = (key: string) =>
		key === "approved" ||
		(key === "in_payroll" && (payout.in_payroll_ct > 0 || payout.paid_ct > 0)) ||
		(key === "paid" && payout.paid_ct > 0);

	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-1">This quarter's payout</h3>
			<p className="text-[11px] text-text-tertiary">
				{payout.quarter || "—"} · {md(payout.mandays)} approved md · {rm(payout.rm)}
			</p>
			<div className="flex items-center gap-1.5 mt-3">
				{NODES.map((n, i) => (
					<div key={n.key} className="flex items-center gap-1.5 flex-1">
						<span
							className={cn(
								"flex-1 text-center text-[11px] py-2 rounded-lg border",
								n.key === stage
									? "bg-yellow/15 border-yellow/40 text-yellow font-semibold"
									: reached(n.key)
										? "bg-mint/15 border-mint/40 text-mint font-semibold"
										: "border-border-subtle text-text-tertiary",
							)}
						>
							{n.label}
						</span>
						{i < NODES.length - 1 && <span className="text-text-tertiary text-xs">→</span>}
					</div>
				))}
			</div>
			<p className="text-[11px] text-text-tertiary mt-2.5">
				Settles with end-of-quarter payroll.
			</p>
		</div>
	);
}
