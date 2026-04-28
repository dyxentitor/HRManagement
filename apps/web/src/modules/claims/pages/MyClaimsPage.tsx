import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type ClaimRequest, claimsApi } from "../api";

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

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-4 max-w-4xl">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">My Claims</h1>
				<Link
					to="/claims/submit"
					className="bg-accent-500 text-white py-1.5 px-3 rounded text-sm hover:bg-accent-600"
				>
					Submit a claim
				</Link>
			</div>
			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}
			{claims.length === 0 ? (
				<p className="text-text-secondary">
					No claims yet.{" "}
					<Link to="/claims/submit" className="underline">
						Submit one
					</Link>
					.
				</p>
			) : (
				<table className="w-full text-sm bg-surface border border-border-subtle rounded">
					<thead className="text-left text-text-secondary border-b border-border-subtle">
						<tr>
							<th className="py-2 pl-3">Date</th>
							<th>Category</th>
							<th>Amount</th>
							<th>Status</th>
							<th className="pr-3">Actions</th>
						</tr>
					</thead>
					<tbody>
						{claims.map((c) => (
							<tr
								key={c.id}
								className="border-t border-border-subtle hover:bg-surface-hover transition-colors"
							>
								<td className="py-2 pl-3">{c.expense_date}</td>
								<td>{c.category_code}</td>
								<td className="font-semibold">
									{c.currency_code} {c.amount}
								</td>
								<td>
									<StatusBadge status={c.status} />
								</td>
								<td className="pr-3 space-x-2 text-xs">
									{(c.status === "draft" || c.status === "submitted") && (
										<button
											type="button"
											onClick={() => onCancel(c.id)}
											className="text-coral hover:underline"
										>
											Cancel
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, string> = {
		draft: "bg-surface-hover text-text-secondary",
		submitted: "bg-sky/15 text-sky",
		manager_approved: "bg-accent-500/15 text-accent-200",
		finance_approved: "bg-accent-500/15 text-accent-200",
		reimbursed: "bg-mint/15 text-mint",
		rejected: "bg-coral/15 text-coral",
		cancelled: "bg-surface-hover text-text-tertiary",
	};
	return (
		<span
			className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-surface-hover"}`}
		>
			{status.replace("_", " ")}
		</span>
	);
}
