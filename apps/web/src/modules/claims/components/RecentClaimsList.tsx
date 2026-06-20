import { useState } from "react";

import { StatusPill } from "@/components/hrms";
import { cn } from "@/lib/utils";
import type { ClaimRequest } from "../api";
import { STATUS_LABEL, STATUS_TONE, categoryMeta, fmtDate, fmtMoney, num } from "../lib/claim-ui";

const ICON_BG: Record<string, string> = {
	yellow: "bg-yellow/15 text-yellow",
	sky: "bg-sky/15 text-sky",
	lavender: "bg-lavender/15 text-lavender",
	mint: "bg-mint/15 text-mint",
	coral: "bg-coral/15 text-coral",
	peach: "bg-peach/15 text-peach",
};

export function RecentClaimsList({
	claims,
	onSelect,
}: {
	claims: ClaimRequest[];
	onSelect: (c: ClaimRequest) => void;
}) {
	const [showAll, setShowAll] = useState(false);
	const sorted = [...claims].sort((a, b) =>
		(b.expense_date ?? "").localeCompare(a.expense_date ?? ""),
	);
	const shown = showAll ? sorted : sorted.slice(0, 6);

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
			<div className="flex items-center justify-between mb-1">
				<h3 className="text-label font-semibold text-text-secondary">Recent claims</h3>
				{sorted.length > 6 && (
					<button
						type="button"
						className="text-small text-accent-200"
						onClick={() => setShowAll((s) => !s)}
					>
						{showAll ? "Show less" : "View all →"}
					</button>
				)}
			</div>
			{shown.length === 0 ? (
				<p className="text-small text-text-tertiary py-2">No claims yet.</p>
			) : (
				<ul>
					{shown.map((c) => {
						const meta = categoryMeta(`${c.category_code} ${c.description}`);
						return (
							<li key={c.id}>
								<button
									type="button"
									onClick={() => onSelect(c)}
									className="w-full flex items-center gap-3 py-2.5 border-t border-border-subtle first:border-t-0 text-left hover:bg-surface-elevated/40 rounded-md px-1 -mx-1"
								>
									<span
										className={cn("size-8 rounded-lg grid place-items-center shrink-0", ICON_BG[meta.tone])}
										aria-hidden
									>
										<meta.icon className="size-4" />
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-small text-text-primary truncate">
											{c.category_code}
											{c.merchant ? ` · ${c.merchant}` : ""}
										</p>
										<p className="text-small text-text-tertiary">{fmtDate(c.expense_date)}</p>
									</div>
									<div className="text-right shrink-0">
										<p className="text-small text-text-primary tabular-nums">
											{fmtMoney(num(c.amount), c.currency_code)}
										</p>
										<StatusPill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status]} />
									</div>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
