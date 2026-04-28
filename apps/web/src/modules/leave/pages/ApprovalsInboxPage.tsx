import { useCallback, useEffect, useState } from "react";

import { type LeaveRequest, leaveApi } from "../api";

export default function ApprovalsInboxPage() {
	const [pending, setPending] = useState<LeaveRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [comment, setComment] = useState<string>("");
	const [actingOn, setActingOn] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const all = await leaveApi.listTeamRequests();
			setPending(all.filter((r) => r.status === "submitted"));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function approve(id: string) {
		try {
			await leaveApi.approve(id, comment);
			setComment("");
			setActingOn(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Approve failed");
		}
	}

	async function reject(id: string) {
		if (!comment.trim()) {
			setError("Comment is required to reject");
			return;
		}
		try {
			await leaveApi.reject(id, comment);
			setComment("");
			setActingOn(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Reject failed");
		}
	}

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-4 max-w-4xl">
			<h1 className="text-2xl font-bold">Approvals Inbox</h1>
			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}

			{pending.length === 0 ? (
				<p className="text-text-secondary">No pending approvals.</p>
			) : (
				<ul className="space-y-2">
					{pending.map((r) => (
						<li
							key={r.id}
							className="bg-surface border border-border-subtle rounded p-3"
						>
							<div className="flex items-center justify-between">
								<div className="text-sm">
									<div className="font-semibold">
										{r.leave_type_code} • {r.total_days} day(s)
									</div>
									<div className="text-text-secondary">
										{r.start_date} → {r.end_date}
									</div>
									{r.reason && (
										<div className="text-text-tertiary mt-1">"{r.reason}"</div>
									)}
								</div>
								{actingOn === r.id ? (
									<div className="space-y-2 ml-3">
										<textarea
											value={comment}
											onChange={(e) => setComment(e.target.value)}
											placeholder="Comment (required for reject)"
											rows={2}
											className="border border-border-subtle rounded px-2 py-1 w-64 text-sm bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
										/>
										<div className="space-x-2">
											<button
												type="button"
												onClick={() => approve(r.id)}
												className="text-xs bg-mint text-canvas px-3 py-1 rounded hover:bg-mint/90"
											>
												Approve
											</button>
											<button
												type="button"
												onClick={() => reject(r.id)}
												className="text-xs bg-canvas text-coral border border-coral/30 px-3 py-1 rounded hover:bg-coral/10"
											>
												Reject
											</button>
											<button
												type="button"
												onClick={() => {
													setActingOn(null);
													setComment("");
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
										onClick={() => setActingOn(r.id)}
										className="text-sm text-text-secondary hover:text-text-primary border border-border-subtle rounded px-3 py-1 hover:bg-surface-hover"
									>
										Review
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
