import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import { type Tone, fmtMoney, num } from "../lib/claim-ui";

interface Event {
	ts: string;
	text: string;
	tone: Tone;
}

function eventFor(c: ClaimRequest): Event | null {
	const money = fmtMoney(num(c.amount), c.currency_code);
	const cat = c.category_code;
	if (c.reimbursed_at)
		return { ts: c.reimbursed_at, text: `Finance paid your ${cat} claim · ${money}`, tone: "mint" };
	if (c.status === "rejected" && c.submitted_at)
		return { ts: c.submitted_at, text: `Your ${cat} claim was rejected`, tone: "coral" };
	if ((c.status === "finance_approved" || c.status === "manager_approved") && c.submitted_at)
		return { ts: c.submitted_at, text: `Your ${cat} claim was approved`, tone: "lavender" };
	if (c.submitted_at)
		return { ts: c.submitted_at, text: `You submitted a ${cat} claim · ${money}`, tone: "sky" };
	return null;
}

const DOT: Record<Tone, string> = {
	mint: "bg-mint",
	coral: "bg-coral",
	lavender: "bg-lavender",
	sky: "bg-sky",
	yellow: "bg-yellow",
	peach: "bg-peach",
};

function timeLabel(iso: string): string {
	const d = new Date(iso);
	const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
	if (days <= 0) return d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
	if (days === 1) return "Yesterday";
	return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function ClaimActivityTimeline({ claims }: { claims: ClaimRequest[] }) {
	const events = useMemo(
		() =>
			claims
				.map(eventFor)
				.filter((e): e is Event => e !== null)
				.sort((a, b) => b.ts.localeCompare(a.ts))
				.slice(0, 7),
		[claims],
	);

	return (
		<section>
			<p className="layer-eyebrow mb-3">Activity</p>
			{events.length === 0 ? (
				<p className="text-small text-text-tertiary">No activity yet.</p>
			) : (
				<ol className="relative pl-5">
					<span
						className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border-subtle"
						aria-hidden
					/>
					{events.map((e, i) => (
						<li key={`${e.ts}-${i}`} className="relative pb-5 last:pb-0">
							<span
								className={cn(
									"absolute -left-5 top-1.5 size-[7px] rounded-full ring-4 ring-canvas",
									DOT[e.tone],
								)}
								aria-hidden
							/>
							<p className="text-small text-text-secondary leading-snug">{e.text}</p>
							<p className="text-[11px] text-text-tertiary mt-0.5">{timeLabel(e.ts)}</p>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
