import { useCallback, useEffect, useState } from "react";

import { type KpiAssignment, kpiApi } from "../api";

export default function MyKpiPage() {
	const [assignments, setAssignments] = useState<KpiAssignment[]>([]);
	const [selected, setSelected] = useState<KpiAssignment | null>(null);
	const [scores, setScores] = useState<Record<string, number>>({});
	const [comment, setComment] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setAssignments(await kpiApi.myAssignments());
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to load KPI assignments",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	function handleSelect(a: KpiAssignment) {
		setSelected(a);
		setScores({});
		setComment("");
		setSuccess(null);
		setError(null);
	}

	async function handleSubmitSelf(e: React.FormEvent) {
		e.preventDefault();
		if (!selected) return;
		setSaving(true);
		setError(null);
		try {
			const scorePayload: Record<string, { score: number; comment: string }> =
				{};
			for (const kpi of selected.kpis) {
				scorePayload[kpi.code] = {
					score: scores[kpi.code] ?? 0,
					comment: "",
				};
			}
			await kpiApi.submitSelf(selected.id, {
				scores: scorePayload,
				overall_comment: comment,
			});
			setSuccess("Self-review submitted!");
			setSelected(null);
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to submit self-review");
		} finally {
			setSaving(false);
		}
	}

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-6 max-w-4xl">
			<h1 className="text-2xl font-bold">My KPI Assignments</h1>
			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}
			{success && <p className="text-mint">{success}</p>}

			{assignments.length === 0 ? (
				<p className="text-text-secondary">No KPI assignments found.</p>
			) : (
				<table className="w-full text-sm border-collapse">
					<thead>
						<tr className="border-b border-border-subtle">
							<th className="text-left py-2 text-text-secondary">Cycle</th>
							<th className="text-left py-2 text-text-secondary">Status</th>
							<th className="text-left py-2 text-text-secondary">KPIs</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{assignments.map((a) => (
							<tr
								key={a.id}
								className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
							>
								<td className="py-2">{a.cycle}</td>
								<td className="py-2 capitalize">
									{a.status.replace("_", " ")}
								</td>
								<td className="py-2">{a.kpis.length} KPIs</td>
								<td className="py-2">
									{a.status === "pending" && (
										<button
											type="button"
											onClick={() => handleSelect(a)}
											className="text-sky hover:underline text-sm"
										>
											Submit Self Review
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{selected && (
				<form
					onSubmit={handleSubmitSelf}
					className="border border-border-subtle rounded p-4 space-y-4 bg-surface"
					aria-label="self-review-form"
				>
					<h2 className="font-semibold">
						Self Review — {selected.kpis.length} KPIs
					</h2>
					{selected.kpis.map((kpi) => (
						<div key={kpi.code} className="space-y-1">
							<label
								htmlFor={`score-${kpi.code}`}
								className="block font-medium text-sm"
							>
								{kpi.name} ({kpi.code})
							</label>
							<input
								id={`score-${kpi.code}`}
								type="number"
								min={0}
								step={0.1}
								value={scores[kpi.code] ?? ""}
								onChange={(e) =>
									setScores((prev) => ({
										...prev,
										[kpi.code]: Number(e.target.value),
									}))
								}
								className="border border-border-subtle rounded px-2 py-1 w-32 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
								placeholder="Score"
							/>
						</div>
					))}
					<div>
						<label
							htmlFor="overall-comment"
							className="block font-medium text-sm"
						>
							Overall Comment
						</label>
						<textarea
							id="overall-comment"
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							className="border border-border-subtle rounded px-2 py-1 w-full bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							rows={3}
						/>
					</div>
					<div className="flex gap-2">
						<button
							type="submit"
							disabled={saving}
							className="bg-accent-500 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-accent-600"
						>
							{saving ? "Submitting…" : "Submit Self Review"}
						</button>
						<button
							type="button"
							onClick={() => setSelected(null)}
							className="bg-canvas border border-border-subtle text-text-secondary px-4 py-2 rounded hover:bg-surface-hover"
						>
							Cancel
						</button>
					</div>
				</form>
			)}
		</div>
	);
}
