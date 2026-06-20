import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";

import { type ClaimRequest, claimsApi } from "../api";
import { ClaimReceipts } from "../components/ClaimReceipts";

const FINANCE_PERM = "claim:approve:finance";

export default function FinanceQueuePage() {
	const { perms } = useAuth();
	const allowed = perms.has(FINANCE_PERM);
	const [queue, setQueue] = useState<ClaimRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [reference, setReference] = useState<string>("");
	const [acting, setActing] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!allowed) return;
		try {
			setQueue(await claimsApi.listFinanceQueue());
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed");
		}
	}, [allowed]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function markReimbursed(id: string) {
		if (!reference.trim()) {
			setError("Reference is required");
			return;
		}
		try {
			await claimsApi.markReimbursed(id, reference);
			setReference("");
			setActing(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Reimburse failed");
		}
	}

	if (!allowed) {
		return (
			<div className="space-y-4 max-w-4xl">
				<h1 className="text-2xl font-bold">Finance Queue</h1>
				<div
					role="alert"
					className="bg-surface border border-border-subtle rounded p-6 text-text-secondary"
				>
					<p className="text-text-primary font-semibold mb-1">Finance access required</p>
					<p className="text-small">
						The reimbursement queue is restricted to users with the finance role. Ask your
						administrator if you should have access.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4 max-w-4xl">
			<h1 className="text-2xl font-bold">Finance Queue</h1>
			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}
			{queue.length === 0 ? (
				<p className="text-text-secondary">No claims awaiting reimbursement.</p>
			) : (
				<ul className="space-y-2">
					{queue.map((c) => (
						<li key={c.id} className="bg-surface border border-border-subtle rounded p-3">
							<div className="flex items-center justify-between">
								<div className="text-sm">
									<div className="font-semibold">
										{c.category_code} • {c.currency_code} {c.amount}
									</div>
									<div className="text-text-secondary">
										{c.expense_date} {c.merchant && `• ${c.merchant}`}
									</div>
									{c.description && (
										<div className="text-text-tertiary mt-1">"{c.description}"</div>
									)}
									<div className="mt-2">
										<span className="text-[10px] uppercase tracking-wide text-text-tertiary block mb-1">
											Receipts
										</span>
										<ClaimReceipts claimId={c.id} attachments={c.attachments} />
									</div>
								</div>
								{acting === c.id ? (
									<div className="space-y-2 ml-3">
										<input
											type="text"
											value={reference}
											onChange={(e) => setReference(e.target.value)}
											placeholder="Bank reference / transaction ID"
											className="border border-border-subtle rounded px-2 py-1 w-64 text-sm bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
										/>
										<div className="space-x-2">
											<button
												type="button"
												onClick={() => markReimbursed(c.id)}
												className="text-xs bg-mint text-canvas px-3 py-1 rounded hover:bg-mint/90"
											>
												Mark reimbursed
											</button>
											<button
												type="button"
												onClick={() => {
													setActing(null);
													setReference("");
												}}
												className="text-xs text-text-secondary underline"
											>
												Cancel
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										onClick={() => setActing(c.id)}
										className="text-sm border border-border-subtle rounded px-3 py-1 text-text-secondary hover:bg-surface-hover"
									>
										Reimburse
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
