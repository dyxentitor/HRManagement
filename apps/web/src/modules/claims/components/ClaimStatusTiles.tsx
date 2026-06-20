import { Ban, CheckCircle2, Clock, Wallet } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import { type Bucket, type Tone, fmtMoney, summarise } from "../lib/claim-ui";

const TILES: {
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

const TONE_SOLID: Record<Tone, string> = {
	peach: "bg-peach",
	lavender: "bg-lavender",
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
};

export function ClaimStatusTiles({ claims }: { claims: ClaimRequest[] }) {
	const stats = summarise(claims);
	return (
		<section>
			<p className="layer-eyebrow mb-2">Status</p>
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
				{TILES.map((t) => {
					const s = stats[t.key];
					return (
						<div
							key={t.key}
							className="relative overflow-hidden rounded-xl p-4 border border-border-subtle bg-surface-hover min-h-[112px] flex flex-col gap-2"
						>
							<span
								className={cn(
									"absolute -top-7 -right-7 size-20 rounded-full blur-2xl opacity-40",
									TONE_SOLID[t.tone],
								)}
								aria-hidden
							/>
							<div className="relative z-10 flex items-center justify-between">
								<span
									className={cn(
										"size-9 rounded-xl grid place-items-center text-canvas",
										TONE_SOLID[t.tone],
									)}
									aria-hidden
								>
									<t.icon className="size-4.5" />
								</span>
								<span className="text-[30px] font-extralight leading-none tabular-nums tracking-tight">
									{s.count}
								</span>
							</div>
							<p className="relative z-10 text-small text-text-secondary leading-tight mt-auto">
								{t.label}
							</p>
							<p className="relative z-10 text-[10px] text-text-tertiary tabular-nums">
								{fmtMoney(s.amount, s.currency)}
							</p>
						</div>
					);
				})}
			</div>
		</section>
	);
}
