import { useState } from "react";

import { StatusPill } from "@/components/hrms";
import { type StatusPillProps } from "@/components/hrms";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type { Claim } from "../api";
import { md, rm } from "./format";

type Tone = NonNullable<StatusPillProps["tone"]>;
type FilterKey = "all" | "pending" | "approved" | "rejected" | "paid";

const isPaid = (c: Claim) => c.status === "approved" && c.payout_status === "paid";

function view(c: Claim): { tone: Tone; label: string } {
	if (isPaid(c)) return { tone: "sky", label: "Paid" };
	switch (c.status) {
		case "pending":
			return { tone: "yellow", label: "Pending" };
		case "approved":
			return { tone: "mint", label: "Approved" };
		case "rejected":
			return { tone: "coral", label: "Rejected" };
		default:
			return { tone: "lavender", label: "Cancelled" };
	}
}

const MATCH: Record<FilterKey, (c: Claim) => boolean> = {
	all: () => true,
	pending: (c) => c.status === "pending",
	approved: (c) => c.status === "approved" && !isPaid(c),
	rejected: (c) => c.status === "rejected",
	paid: isPaid,
};

export function MyClaimsList({
	claims,
	onEdit,
	onResubmit,
	onCancel,
	rate,
}: {
	claims: Claim[];
	rate: string;
	onEdit: (claim: Claim) => void;
	onResubmit: (claim: Claim) => void;
	onCancel: (claimId: string) => void;
}) {
	const [filter, setFilter] = useState<FilterKey>("all");
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const count = (k: FilterKey) => claims.filter(MATCH[k]).length;
	const shown = claims.filter(MATCH[filter]);
	const chips: { key: FilterKey; label: string }[] = [
		{ key: "all", label: "All" },
		{ key: "pending", label: "Pending" },
		{ key: "approved", label: "Approved" },
		{ key: "rejected", label: "Rejected" },
		{ key: "paid", label: "Paid" },
	];

	return (
		<div className="glass-surface rounded-2xl p-4">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-body font-semibold">My claims</h3>
				<span className="text-[11px] text-text-tertiary">{claims.length} total</span>
			</div>

			<div className="flex flex-wrap gap-2 mb-2">
				{chips.map((c) => (
					<button
						key={c.key}
						type="button"
						onClick={() => setFilter(c.key)}
						className={
							filter === c.key
								? "text-[11px] px-2.5 py-1 rounded-full border border-accent-500/40 bg-accent-500/15 text-accent-200"
								: "text-[11px] px-2.5 py-1 rounded-full border border-border-subtle text-text-tertiary hover:text-text-secondary"
						}
					>
						{c.label} {c.key !== "all" ? count(c.key) : ""}
					</button>
				))}
			</div>

			{shown.length === 0 ? (
				<p className="text-small text-text-tertiary py-6 text-center">
					{claims.length === 0
						? "No claims yet — log your first from the composer above."
						: "Nothing in this view."}
				</p>
			) : (
				<div className="divide-y divide-border-subtle/60">
					{shown.map((c) => {
						const v = view(c);
						return (
							<div key={c.id} className="flex items-start gap-4 py-3.5">
								<div className="flex-1 min-w-0">
									<p className="text-small font-medium text-text-primary truncate">{c.project_name}</p>
									<p className="text-[11px] text-text-tertiary mt-0.5">
										{c.status === "approved" && c.billing_quarter
											? `Billing ${c.billing_quarter}`
											: c.reviewed_at
												? `Reviewed ${c.reviewed_at.slice(0, 10)}`
												: `Submitted ${c.created_at.slice(0, 10)}`}
									</p>
									{c.status === "rejected" && c.reject_reason && (
										<p className="text-[11px] text-coral mt-1.5 bg-coral/10 border border-coral/20 rounded-md px-2 py-1">
											✕ {c.reject_reason}
										</p>
									)}
									<div className="flex gap-2 mt-2">
										{c.status === "pending" && (
											<>
												<button
													type="button"
													onClick={() => onEdit(c)}
													className="text-[11px] px-2 py-0.5 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary"
												>
													Edit
												</button>
												<button
													type="button"
													onClick={() => setConfirmId(c.id)}
													className="text-[11px] px-2 py-0.5 rounded-md border border-coral/40 text-coral hover:bg-coral/10"
												>
													Cancel
												</button>
											</>
										)}
										{c.status === "rejected" && (
											<button
												type="button"
												onClick={() => onResubmit(c)}
												className="text-[11px] px-2 py-0.5 rounded-md border border-accent-500/40 text-accent-200 hover:bg-accent-500/10"
											>
												Resubmit
											</button>
										)}
									</div>
								</div>
								<div className="text-right shrink-0">
									<p className="text-small font-semibold tabular-nums">{md(c.mandays)} md</p>
									<p className="text-[10px] text-text-tertiary">
										≈ {rm(Number(c.mandays) * Number(rate))}
									</p>
								</div>
								<div className="shrink-0 text-right min-w-[92px]">
									<StatusPill tone={v.tone} label={v.label} />
									{c.status === "approved" && !isPaid(c) && (
										<p className="text-[10px] text-text-tertiary mt-1">payout pending</p>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			<ConfirmDialog
				open={confirmId !== null}
				onOpenChange={(o) => !o && setConfirmId(null)}
				title="Cancel this claim?"
				description="This withdraws your pending claim. You can log a new one anytime."
				confirmLabel="Cancel claim"
				variant="danger"
				onConfirm={() => {
					if (confirmId) onCancel(confirmId);
					setConfirmId(null);
				}}
			/>
		</div>
	);
}
