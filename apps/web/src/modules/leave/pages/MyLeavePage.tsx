import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type LeaveBalance, type LeaveRequest, leaveApi } from "../api";

export default function MyLeavePage() {
	const [balances, setBalances] = useState<LeaveBalance[]>([]);
	const [requests, setRequests] = useState<LeaveRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [b, r] = await Promise.all([
				leaveApi.myBalances(),
				leaveApi.listMyRequests(),
			]);
			setBalances(b);
			setRequests(r);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function onCancel(id: string) {
		try {
			await leaveApi.cancel(id);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Cancel failed");
		}
	}

	async function onWithdraw(id: string) {
		try {
			await leaveApi.withdraw(id);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Withdraw failed");
		}
	}

	if (loading) return <p>Loading…</p>;
	if (error)
		return (
			<p role="alert" className="text-red-600">
				{error}
			</p>
		);

	return (
		<div className="space-y-6 max-w-4xl">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">My Leave</h1>
				<Link
					to="/leave/apply"
					className="bg-slate-900 text-white py-1.5 px-3 rounded text-sm"
				>
					Apply for leave
				</Link>
			</div>

			<section className="bg-white border rounded p-4">
				<h2 className="font-semibold mb-3">
					Balances ({balances[0]?.year ?? new Date().getFullYear()})
				</h2>
				{balances.length === 0 ? (
					<p className="text-slate-500 text-sm">No balances yet.</p>
				) : (
					<table className="w-full text-sm">
						<thead className="text-left text-slate-500">
							<tr>
								<th className="py-1">Type</th>
								<th>Entitled</th>
								<th>Accrued</th>
								<th>Taken</th>
								<th>Pending</th>
								<th>Available</th>
							</tr>
						</thead>
						<tbody>
							{balances.map((b) => (
								<tr key={b.id} className="border-t">
									<td className="py-1.5">{b.leave_type_code}</td>
									<td>{b.entitled}</td>
									<td>{b.accrued}</td>
									<td>{b.taken}</td>
									<td>{b.pending}</td>
									<td className="font-semibold">{b.available}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			<section className="bg-white border rounded p-4">
				<h2 className="font-semibold mb-3">My Requests</h2>
				{requests.length === 0 ? (
					<p className="text-slate-500 text-sm">
						No leave requests yet.{" "}
						<Link to="/leave/apply" className="underline">
							Apply now
						</Link>
						.
					</p>
				) : (
					<table className="w-full text-sm">
						<thead className="text-left text-slate-500">
							<tr>
								<th className="py-1">Type</th>
								<th>Dates</th>
								<th>Days</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{requests.map((r) => (
								<tr key={r.id} className="border-t">
									<td className="py-1.5">{r.leave_type_code}</td>
									<td>
										{r.start_date} → {r.end_date}
									</td>
									<td>{r.total_days}</td>
									<td>
										<StatusBadge status={r.status} />
									</td>
									<td className="space-x-2">
										{r.status === "submitted" && (
											<button
												type="button"
												onClick={() => onWithdraw(r.id)}
												className="text-amber-700 hover:underline text-xs"
											>
												Withdraw
											</button>
										)}
										{(r.status === "draft" || r.status === "submitted") && (
											<button
												type="button"
												onClick={() => onCancel(r.id)}
												className="text-red-700 hover:underline text-xs"
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
			</section>
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, string> = {
		draft: "bg-slate-100 text-slate-700",
		submitted: "bg-blue-100 text-blue-700",
		approved: "bg-green-100 text-green-700",
		rejected: "bg-red-100 text-red-700",
		cancelled: "bg-slate-100 text-slate-500",
		withdrawn: "bg-amber-100 text-amber-700",
	};
	return (
		<span
			className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-slate-100"}`}
		>
			{status}
		</span>
	);
}
