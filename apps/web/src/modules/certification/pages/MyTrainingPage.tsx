import { useCallback, useEffect, useState } from "react";

import { type TrainingAssignment, certificationApi } from "../api";

export default function MyTrainingPage() {
	const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setAssignments(await certificationApi.myAssignments());
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to load training assignments",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleComplete(id: string) {
		setError(null);
		try {
			await certificationApi.completeAssignment(id);
			setSuccess("Training marked complete!");
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to mark as complete");
		}
	}

	async function handleUpdateProgress(assignmentId: string, pct: number) {
		setError(null);
		try {
			await certificationApi.addProgress({
				assignment: assignmentId,
				progress_pct: pct,
				notes: "",
			});
			setSuccess(`Progress updated to ${pct}%`);
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to update progress");
		}
	}

	function statusBadge(s: string): string {
		if (s === "overdue") return "text-red-600 font-semibold";
		if (s === "completed") return "text-green-600";
		if (s === "in_progress") return "text-blue-600";
		return "text-slate-600";
	}

	function latestProgress(a: TrainingAssignment): number {
		if (!a.progress?.length) return 0;
		const sorted = [...a.progress].sort(
			(x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime(),
		);
		return Number.parseFloat(sorted[0].progress_pct);
	}

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-6 max-w-4xl">
			<h1 className="text-2xl font-bold">My Training</h1>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{success && <p className="text-green-600">{success}</p>}

			{assignments.length === 0 ? (
				<p className="text-slate-500">No training assignments.</p>
			) : (
				<div className="space-y-4">
					{assignments.map((a) => {
						const pct = latestProgress(a);
						return (
							<div key={a.id} className="border rounded p-4 bg-white space-y-3">
								<div className="flex items-center justify-between">
									<span className="font-medium">{a.plan}</span>
									<span className={statusBadge(a.status)}>{a.status}</span>
								</div>
								<div className="text-sm text-slate-500">Due: {a.due_date}</div>

								{/* Progress slider */}
								{a.status !== "completed" && (
									<div className="space-y-1">
										<label className="text-sm font-medium">
											Progress: {pct}%
										</label>
										<input
											type="range"
											min={0}
											max={100}
											step={5}
											defaultValue={pct}
											onChange={(e) =>
												handleUpdateProgress(a.id, Number(e.target.value))
											}
											className="w-full"
										/>
										<div className="w-full bg-slate-200 rounded-full h-2">
											<div
												className="bg-blue-500 h-2 rounded-full"
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								)}

								{/* Complete button */}
								{a.status !== "completed" && (
									<button
										type="button"
										onClick={() => handleComplete(a.id)}
										className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
									>
										Mark Complete
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
