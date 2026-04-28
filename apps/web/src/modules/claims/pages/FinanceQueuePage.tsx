import { useCallback, useEffect, useState } from "react";

import { type ClaimRequest, claimsApi } from "../api";

export default function FinanceQueuePage() {
	const [queue, setQueue] = useState<ClaimRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [reference, setReference] = useState<string>("");
	const [acting, setActing] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setQueue(await claimsApi.listFinanceQueue());
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed");
		}
	}, []);

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
						<li
							key={c.id}
							className="bg-surface border border-border-subtle rounded p-3"
						>
							<div className="flex items-center justify-between">
								<div className="text-sm">
									<div className="font-semibold">
										{c.category_code} • {c.currency_code} {c.amount}
									</div>
									<div className="text-text-secondary">
										{c.expense_date} {c.merchant && `• ${c.merchant}`}
									</div>
									{c.description && (
										<div className="text-text-tertiary mt-1">
											"{c.description}"
										</div>
									)}
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
