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
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{queue.length === 0 ? (
				<p className="text-slate-500">No claims awaiting reimbursement.</p>
			) : (
				<ul className="space-y-2">
					{queue.map((c) => (
						<li key={c.id} className="bg-white border rounded p-3">
							<div className="flex items-center justify-between">
								<div className="text-sm">
									<div className="font-semibold">
										{c.category_code} • {c.currency_code} {c.amount}
									</div>
									<div className="text-slate-600">
										{c.expense_date} {c.merchant && `• ${c.merchant}`}
									</div>
									{c.description && (
										<div className="text-slate-500 mt-1">"{c.description}"</div>
									)}
								</div>
								{acting === c.id ? (
									<div className="space-y-2 ml-3">
										<input
											type="text"
											value={reference}
											onChange={(e) => setReference(e.target.value)}
											placeholder="Bank reference / transaction ID"
											className="border rounded px-2 py-1 w-64 text-sm"
										/>
										<div className="space-x-2">
											<button
												type="button"
												onClick={() => markReimbursed(c.id)}
												className="text-xs bg-green-700 text-white px-3 py-1 rounded"
											>
												Mark reimbursed
											</button>
											<button
												type="button"
												onClick={() => {
													setActing(null);
													setReference("");
												}}
												className="text-xs text-slate-600 underline"
											>
												Cancel
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										onClick={() => setActing(c.id)}
										className="text-sm border rounded px-3 py-1"
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
