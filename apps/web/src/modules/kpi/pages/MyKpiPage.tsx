import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import { type KpiAssignment, type KpiAssignmentStatus, kpiApi } from "../api";

const STATUS_TONE: Record<
	KpiAssignmentStatus,
	"yellow" | "sky" | "mint" | "lavender"
> = {
	pending: "yellow",
	self_done: "sky",
	manager_done: "lavender",
	closed: "mint",
};

const STATUS_LABEL: Record<KpiAssignmentStatus, string> = {
	pending: "Pending self-review",
	self_done: "Awaiting manager review",
	manager_done: "Manager reviewed",
	closed: "Closed",
};

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
			setSuccess("Self-review submitted successfully.");
			setSelected(null);
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to submit self-review");
		} finally {
			setSaving(false);
		}
	}

	if (loading)
		return <p className="text-text-tertiary p-4">Loading KPI assignments…</p>;

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader breadcrumb="KPI" title="My KPI Assignments" />

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
					<p className="text-text-secondary">No KPI assignments found.</p>
				</div>
			) : (
				<section className="bg-surface-hover border border-border-subtle rounded-lg overflow-hidden">
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="border-b border-border-subtle bg-surface-hover">
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Cycle
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									Status
								</th>
								<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
									KPIs
								</th>
								<th className="py-3 px-4" />
							</tr>
						</thead>
						<tbody>
							{assignments.map((a) => (
								<tr
									key={a.id}
									className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors"
								>
									<td className="py-3 px-4 text-body text-text-primary font-medium">
										{a.cycle}
									</td>
									<td className="py-3 px-4">
										<StatusPill
											tone={STATUS_TONE[a.status]}
											label={STATUS_LABEL[a.status]}
										/>
									</td>
									<td className="py-3 px-4 text-body text-text-secondary">
										{a.kpis.length} KPI{a.kpis.length !== 1 ? "s" : ""}
									</td>
									<td className="py-3 px-4 text-right">
										{a.status === "pending" && (
											<button
												type="button"
												onClick={() => handleSelect(a)}
												className="text-small text-accent-200 hover:text-accent-50 hover:underline"
											>
												Submit self-review
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			{selected && (
				<section
					className="border border-border-subtle rounded-lg p-5 space-y-4 bg-surface-hover"
					aria-label="self-review-form"
				>
					<header>
						<h2 className="text-h2 text-text-primary">Self-review</h2>
						<p className="text-body text-text-secondary mt-1">
							Cycle: <strong>{selected.cycle}</strong> · {selected.kpis.length}{" "}
							KPI{selected.kpis.length !== 1 ? "s" : ""}
						</p>
					</header>

					<form onSubmit={handleSubmitSelf} className="space-y-4">
						<div className="divide-y divide-border-subtle">
							{selected.kpis.map((kpi) => (
								<div key={kpi.code} className="py-3 space-y-2">
									<div>
										<p className="text-body text-text-primary font-medium">
											{kpi.name}
										</p>
										{kpi.description && (
											<p className="text-small text-text-secondary mt-0.5">
												{kpi.description}
											</p>
										)}
										<div className="flex items-center gap-3 mt-1">
											<span className="text-label uppercase text-text-tertiary text-xs">
												{kpi.metric_type}
											</span>
											{kpi.target && (
												<span className="text-label text-text-tertiary text-xs">
													Target: {kpi.target} {kpi.unit}
												</span>
											)}
											{kpi.weight && (
												<span className="text-label text-text-tertiary text-xs">
													Weight: {kpi.weight}
												</span>
											)}
										</div>
									</div>
									<div className="flex items-center gap-3">
										<label
											htmlFor={`score-${kpi.code}`}
											className="text-small text-text-secondary"
										>
											Score {kpi.unit ? `(${kpi.unit})` : ""}
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
											placeholder="0"
										/>
									</div>
								</div>
							))}
						</div>

						<div>
							<label
								htmlFor="overall-comment"
								className="block text-small text-text-secondary mb-1"
							>
								Overall comment
							</label>
							<textarea
								id="overall-comment"
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								className="border border-border-subtle rounded px-3 py-2 w-full bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
								rows={3}
								placeholder="Add any overall comments…"
							/>
						</div>

						{error && (
							<p role="alert" className="text-coral text-small">
								{error}
							</p>
						)}

						<div className="flex gap-2">
							<button
								type="submit"
								disabled={saving}
								className="bg-accent-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-accent-600"
							>
								{saving ? "Submitting…" : "Submit self-review"}
							</button>
							<button
								type="button"
								onClick={() => setSelected(null)}
								className="bg-canvas border border-border-subtle text-text-secondary px-4 py-2 rounded text-sm hover:bg-surface-hover"
							>
								Cancel
							</button>
						</div>
					</form>
				</section>
			)}
		</div>
	);
}
