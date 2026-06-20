import { Ban, CheckCircle2, Clock, Wallet } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import { type Bucket, type Tone, fmtMoney, summarise } from "../lib/claim-ui";

const CARDS: {
	key: Bucket;
	label: string;
	tone: Tone;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{ key: "pending", label: "Pending", tone: "yellow", icon: Clock },
	{ key: "approved", label: "Approved", tone: "lavender", icon: CheckCircle2 },
	{ key: "paid", label: "Paid", tone: "mint", icon: Wallet },
	{ key: "rejected", label: "Rejected", tone: "coral", icon: Ban },
];

const ICON_BG: Record<Tone, string> = {
	yellow: "bg-yellow/15 text-yellow",
	lavender: "bg-lavender/15 text-lavender",
	mint: "bg-mint/15 text-mint",
	coral: "bg-coral/15 text-coral",
	sky: "bg-sky/15 text-sky",
	peach: "bg-peach/15 text-peach",
};

export function ClaimSummaryCards({ claims }: { claims: ClaimRequest[] }) {
	const stats = summarise(claims);
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
			{CARDS.map((c) => {
				const s = stats[c.key];
				return (
					<div
						key={c.key}
						className="bg-surface-hover border border-border-subtle rounded-xl p-4 flex items-center gap-3"
					>
						<span
							className={cn("size-10 rounded-xl grid place-items-center shrink-0", ICON_BG[c.tone])}
							aria-hidden
						>
							<c.icon className="size-5" />
						</span>
						<div className="min-w-0">
							<p className="text-h1 leading-none tabular-nums">{s.count}</p>
							<p className="text-small text-text-tertiary mt-1 truncate">
								{c.label} · {fmtMoney(s.amount, s.currency)}
							</p>
						</div>
					</div>
				);
			})}
		</div>
	);
}
