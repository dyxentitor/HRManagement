import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import { isInFlight } from "../lib/claim-ui";
import { ClaimProgressCard } from "./ClaimProgressCard";

/** "In progress" section — rich claim cards with an In progress / All toggle. */
export function InProgressClaims({
	claims,
	onSelect,
}: {
	claims: ClaimRequest[];
	onSelect: (c: ClaimRequest) => void;
}) {
	const [showAll, setShowAll] = useState(false);

	const inFlight = useMemo(() => claims.filter((c) => isInFlight(c.status)), [claims]);
	const sorted = useMemo(
		() => [...claims].sort((a, b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? "")),
		[claims],
	);
	const shown = showAll ? sorted : inFlight;

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<p className="layer-eyebrow">
					{showAll ? "All claims" : `In progress · ${inFlight.length}`}
				</p>
				<div className="flex gap-1 text-small">
					<button
						type="button"
						onClick={() => setShowAll(false)}
						className={cn(
							"px-2.5 py-1 rounded-full",
							!showAll ? "bg-accent-500/15 text-text-primary" : "text-text-tertiary",
						)}
					>
						In progress
					</button>
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className={cn(
							"px-2.5 py-1 rounded-full",
							showAll ? "bg-accent-500/15 text-text-primary" : "text-text-tertiary",
						)}
					>
						All
					</button>
				</div>
			</div>

			{shown.length === 0 ? (
				<div className="glass-surface rounded-2xl p-8 text-center text-text-tertiary">
					{showAll
						? "No claims yet — pick a category below to start."
						: "Nothing in progress. You're all settled. 🎉"}
				</div>
			) : (
				<div className="grid sm:grid-cols-2 gap-3">
					{shown.map((c) => (
						<ClaimProgressCard key={c.id} claim={c} onSelect={onSelect} />
					))}
				</div>
			)}
		</section>
	);
}
