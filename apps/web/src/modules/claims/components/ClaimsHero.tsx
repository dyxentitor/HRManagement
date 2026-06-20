import { Plus, Receipt } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { DonutChart } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import type { ClaimRequest } from "../api";
import { fmtMoney, isInFlight, summarise } from "../lib/claim-ui";

export function ClaimsHero({
	claims,
	onAddReceipt,
}: {
	claims: ClaimRequest[];
	onAddReceipt?: (claim: ClaimRequest) => void;
}) {
	const s = summarise(claims);
	const inFlight = s.pending.amount + s.approved.amount;
	const currency = s.pending.currency;
	const inFlightCount = s.pending.count + s.approved.count;

	const paid = s.paid.amount;
	const ringTotal = paid + inFlight;
	const pct = ringTotal > 0 ? Math.round((paid / ringTotal) * 100) : 0;
	const segments =
		ringTotal > 0
			? ([
					{ value: paid, color: "mint", label: "Paid" },
					{ value: inFlight, color: "sky", label: "Outstanding" },
				] as const)
			: ([{ value: 1, color: "sky", label: "No claims yet" }] as const);

	const needsReceipt = useMemo(
		() => claims.find((c) => isInFlight(c.status) && c.attachments.length === 0),
		[claims],
	);

	const line =
		claims.length === 0
			? "Submit your first claim and track it through to payment."
			: inFlightCount === 0
				? "All your claims are settled — nothing awaiting payment."
				: `Across ${inFlightCount} claim${inFlightCount === 1 ? "" : "s"} · expected within a week.`;

	return (
		<section className="relative grid lg:grid-cols-[1.6fr_1fr] rounded-2xl overflow-hidden border border-border-subtle min-h-[184px]">
			<div className="hero-aurora absolute inset-0" aria-hidden>
				<svg
					viewBox="0 0 1200 200"
					preserveAspectRatio="none"
					className="absolute bottom-0 left-0 w-full opacity-50"
					aria-hidden
				>
					<title>decorative waves</title>
					<path
						d="M0 140 C200 90 380 180 600 130 C820 80 1000 170 1200 120 L1200 200 L0 200 Z"
						fill="rgb(124 92 255 / 0.25)"
					/>
					<path
						d="M0 165 C240 120 420 195 640 155 C880 110 1040 185 1200 150 L1200 200 L0 200 Z"
						fill="rgb(160 207 236 / 0.12)"
					/>
				</svg>
			</div>

			<div className="relative z-10 p-7 flex flex-col justify-center gap-2">
				<p className="layer-eyebrow text-accent-200">Reimbursements</p>
				<div className="flex items-end gap-3">
					<span className="text-[44px] font-extralight leading-none tracking-tight tabular-nums">
						{ringTotal > 0 ? fmtMoney(inFlight, currency) : "RM 0"}
					</span>
					<span className="text-text-secondary pb-1.5">to be reimbursed</span>
				</div>
				<p className="text-small text-text-secondary">{line}</p>
				<div className="flex flex-wrap items-center gap-3 mt-3">
					<Button asChild className="soft-glow rounded-xl">
						<Link to="/claims/submit">
							<Plus className="size-4 mr-1" /> Submit a claim
						</Link>
					</Button>
					{needsReceipt && onAddReceipt && (
						<button
							type="button"
							onClick={() => onAddReceipt(needsReceipt)}
							className="inline-flex items-center gap-2 text-small text-yellow bg-yellow/10 border border-yellow/25 rounded-xl px-3 py-2"
						>
							<Receipt className="size-3.5" /> A claim still needs a receipt → add it
						</button>
					)}
				</div>
			</div>

			<div className="relative z-10 m-3.5 glass-surface rounded-xl p-4 flex flex-col justify-center gap-3">
				<DonutChart
					size={84}
					segments={segments as never}
					centerLabel={<span className="text-h3">{pct}%</span>}
				/>
				<p className="text-small text-text-tertiary">
					{s.approved.count > 0
						? `Next payment · ${fmtMoney(s.approved.amount, currency)} approved`
						: `${s.paid.count} of ${s.pending.count + s.approved.count + s.paid.count} settled`}
				</p>
			</div>
		</section>
	);
}
