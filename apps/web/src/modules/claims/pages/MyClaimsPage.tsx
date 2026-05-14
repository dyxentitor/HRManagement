import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import { type ClaimRequest, type ClaimStatus, claimsApi } from "../api";

const STATUS_TONE: Record<
	ClaimStatus,
	"yellow" | "sky" | "lavender" | "mint" | "coral" | "peach"
> = {
	draft: "yellow",
	submitted: "sky",
	manager_approved: "lavender",
	finance_approved: "lavender",
	reimbursed: "mint",
	rejected: "coral",
	cancelled: "peach",
};

const STATUS_LABEL: Record<ClaimStatus, string> = {
	draft: "Draft",
	submitted: "Submitted",
	manager_approved: "Manager approved",
	finance_approved: "Finance approved",
	reimbursed: "Reimbursed",
	rejected: "Rejected",
	cancelled: "Cancelled",
};

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export default function MyClaimsPage() {
	const [claims, setClaims] = useState<ClaimRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const c = await claimsApi.listMine();
			setClaims(c);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function onCancel(id: string) {
		try {
			await claimsApi.cancel(id);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Cancel failed");
		}
	}

	if (loading) return <p className="text-text-tertiary p-4">Loading claims…</p>;

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader
				breadcrumb="Claims"
				title="My Claims"
				actions={
					<Link
						to="/claims/submit"
						className="bg-accent-500 text-white px-4 py-2 rounded text-sm hover:bg-accent-600"
					>
						Submit a claim
					</Link>
				}
			/>

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{claims.length === 0 ? (
				<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
					<p className="text-text-secondary">
						No claims yet.{" "}
						<Link
							to="/claims/submit"
							className="text-accent-200 hover:underline"
						>
							Submit one
						</Link>
						.
					</p>
				</div>
			) : (
				<section className="bg-surface-hover border border-border-subtle rounded-lg overflow-hidden">
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="border-b border-border-subtle bg-surface-hover">
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Date
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Category
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Amount
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Status
								</th>
								<th className="text-right py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{claims.map((c) => (
								<tr
									key={c.id}
									className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors"
								>
									<td className="py-3 px-4 text-body text-text-primary">
										{formatDate(c.expense_date)}
									</td>
									<td className="py-3 px-4 text-body text-text-secondary">
										{c.category_code}
									</td>
									<td className="py-3 px-4 text-body text-text-primary font-semibold">
										{c.currency_code} {c.amount}
									</td>
									<td className="py-3 px-4">
										<StatusPill
											tone={STATUS_TONE[c.status]}
											label={STATUS_LABEL[c.status]}
										/>
									</td>
									<td className="py-3 px-4 text-right">
										{(c.status === "draft" || c.status === "submitted") && (
											<button
												type="button"
												onClick={() => onCancel(c.id)}
												className="text-small text-coral hover:underline"
											>
												Cancel
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
}
