import { useMemo } from "react";

import type { ClaimRequest } from "../api";
import { fmtMoney, num } from "../lib/claim-ui";

interface Event {
	ts: string;
	text: string;
}

function eventFor(c: ClaimRequest): Event | null {
	const money = fmtMoney(num(c.amount), c.currency_code);
	const cat = c.category_code;
	if (c.reimbursed_at) return { ts: c.reimbursed_at, text: `Finance paid your ${cat} claim · ${money}` };
	if (c.status === "rejected" && c.submitted_at)
		return { ts: c.submitted_at, text: `Your ${cat} claim was rejected` };
	if ((c.status === "finance_approved" || c.status === "manager_approved") && c.submitted_at)
		return { ts: c.submitted_at, text: `Your ${cat} claim was approved` };
	if (c.submitted_at) return { ts: c.submitted_at, text: `You submitted a ${cat} claim · ${money}` };
	return null;
}

function timeLabel(iso: string): string {
	const d = new Date(iso);
	const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
	if (days <= 0) return d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
	if (days === 1) return "Yest.";
	return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function ClaimActivityFeed({ claims }: { claims: ClaimRequest[] }) {
	const events = useMemo(() => {
		return claims
			.map(eventFor)
			.filter((e): e is Event => e !== null)
			.sort((a, b) => b.ts.localeCompare(a.ts))
			.slice(0, 6);
	}, [claims]);

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">Recent activity</h3>
			{events.length === 0 ? (
				<p className="text-small text-text-tertiary">No activity yet.</p>
			) : (
				<ul className="space-y-0.5">
					{events.map((e, i) => (
						<li
							key={`${e.ts}-${i}`}
							className="flex gap-3 py-2 text-small border-t border-border-subtle first:border-t-0"
						>
							<span className="text-text-tertiary tabular-nums w-12 shrink-0">
								{timeLabel(e.ts)}
							</span>
							<span className="text-text-secondary">{e.text}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
