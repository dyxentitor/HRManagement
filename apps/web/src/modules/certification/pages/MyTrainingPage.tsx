import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import {
	type TrainingAssignment,
	type TrainingAssignmentStatus,
	certificationApi,
} from "../api";

const STATUS_TONE: Record<
	TrainingAssignmentStatus,
	"yellow" | "sky" | "mint" | "coral"
> = {
	assigned: "yellow",
	in_progress: "sky",
	completed: "mint",
	overdue: "coral",
};

const STATUS_LABEL: Record<TrainingAssignmentStatus, string> = {
	assigned: "Assigned",
	in_progress: "In progress",
	completed: "Completed",
	overdue: "Overdue",
};

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

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

	function latestProgress(a: TrainingAssignment): number {
		if (!a.progress?.length) return 0;
		const sorted = [...a.progress].sort(
			(x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime(),
		);
		return Number.parseFloat(sorted[0].progress_pct);
	}

	if (loading)
		return <p className="text-text-tertiary p-4">Loading training…</p>;

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader breadcrumb="Training" title="My Training" />

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}
			{success && (
				<p className="text-mint text-small" role="status">
					{success}
				</p>
			)}

			{assignments.length === 0 ? (
				<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
					<p className="text-text-secondary">No training assignments.</p>
				</div>
			) : (
				<div className="space-y-4">
					{assignments.map((a) => {
						const pct = latestProgress(a);
						return (
							<div
								key={a.id}
								className="border border-border-subtle rounded-lg p-4 bg-surface-hover space-y-3"
							>
								<div className="flex items-center justify-between gap-3">
									<span className="text-body text-text-primary font-medium">
										{a.plan}
									</span>
									<StatusPill
										tone={STATUS_TONE[a.status]}
										label={STATUS_LABEL[a.status]}
									/>
								</div>
								<div className="text-small text-text-secondary">
									Due: {formatDate(a.due_date)}
								</div>

								{a.status !== "completed" && (
									<div className="space-y-1">
										<label
											htmlFor={`progress-${a.id}`}
											className="text-small text-text-secondary"
										>
											Progress: {pct}%
										</label>
										<input
											id={`progress-${a.id}`}
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
										<div className="w-full bg-border-subtle rounded-full h-2">
											<div
												className="bg-accent-500 h-2 rounded-full"
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								)}

								{a.status !== "completed" && (
									<button
										type="button"
										onClick={() => handleComplete(a.id)}
										className="px-3 py-1.5 bg-mint text-canvas rounded text-small hover:bg-mint/90"
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
