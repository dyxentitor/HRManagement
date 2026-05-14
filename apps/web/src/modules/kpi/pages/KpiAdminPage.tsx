import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import {
	type KpiCycle,
	type KpiCycleStatus,
	type KpiTemplate,
	kpiApi,
} from "../api";

const STATUS_TONE: Record<
	KpiCycleStatus,
	"yellow" | "sky" | "lavender" | "mint"
> = {
	upcoming: "yellow",
	self_review: "sky",
	manager_review: "lavender",
	closed: "mint",
};

const STATUS_LABEL: Record<KpiCycleStatus, string> = {
	upcoming: "Upcoming",
	self_review: "Self review",
	manager_review: "Manager review",
	closed: "Closed",
};

const CYCLE_TYPE_LABEL: Record<KpiCycle["type"], string> = {
	quarterly: "Quarterly",
	semi_annual: "Semi-annual",
	annual: "Annual",
};

export default function KpiAdminPage() {
	const [cycles, setCycles] = useState<KpiCycle[]>([]);
	const [templates, setTemplates] = useState<KpiTemplate[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const [showNewCycle, setShowNewCycle] = useState(false);
	const [newCycleName, setNewCycleName] = useState("");
	const [newCycleType, setNewCycleType] = useState<
		"quarterly" | "semi_annual" | "annual"
	>("quarterly");
	const [newCycleStartsOn, setNewCycleStartsOn] = useState("");
	const [newCycleEndsOn, setNewCycleEndsOn] = useState("");
	const [newCycleReviewOpens, setNewCycleReviewOpens] = useState("");
	const [newCycleReviewCloses, setNewCycleReviewCloses] = useState("");

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [c, t] = await Promise.all([
				kpiApi.listCycles(),
				kpiApi.listTemplates(),
			]);
			setCycles(c);
			setTemplates(t);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load KPI data");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleTransition(
		cycleId: string,
		action: "self" | "manager" | "close",
	) {
		setError(null);
		try {
			if (action === "self") await kpiApi.openSelfReview(cycleId);
			else if (action === "manager") await kpiApi.openManagerReview(cycleId);
			else await kpiApi.closeCycle(cycleId);
			setSuccess("Cycle updated successfully");
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Transition failed");
		}
	}

	async function handleCreateCycle(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		try {
			await kpiApi.createCycle({
				name: newCycleName,
				type: newCycleType,
				starts_on: newCycleStartsOn,
				ends_on: newCycleEndsOn,
				review_opens_on: newCycleReviewOpens,
				review_closes_on: newCycleReviewCloses,
			});
			setSuccess("Cycle created!");
			setShowNewCycle(false);
			setNewCycleName("");
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create cycle");
		}
	}

	if (loading)
		return <p className="text-text-tertiary p-4">Loading KPI data…</p>;

	return (
		<div className="space-y-8 max-w-5xl mx-auto">
			<PageHeader
				breadcrumb="KPI"
				title="KPI Admin"
				actions={
					<button
						type="button"
						onClick={() => setShowNewCycle(!showNewCycle)}
						className="bg-accent-500 text-white px-4 py-2 rounded text-sm hover:bg-accent-600"
					>
						{showNewCycle ? "Cancel" : "+ New Cycle"}
					</button>
				}
			/>

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

			<section className="space-y-3">
				<h2 className="text-h2 text-text-primary">
					Templates ({templates.length})
				</h2>
				{templates.length === 0 ? (
					<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
						<p className="text-text-secondary">No templates yet.</p>
					</div>
				) : (
					<ul className="bg-surface-hover border border-border-subtle rounded-lg overflow-hidden divide-y divide-border-subtle">
						{templates.map((t) => (
							<li key={t.id} className="py-3 px-4">
								<span className="text-body text-text-primary font-medium">
									{t.name}
								</span>
								{t.definitions.length > 0 && (
									<span className="text-small text-text-secondary ml-2">
										({t.definitions.length} KPIs)
									</span>
								)}
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-h2 text-text-primary">Cycles</h2>

				{showNewCycle && (
					<form
						onSubmit={handleCreateCycle}
						className="border border-border-subtle rounded-lg p-4 space-y-3 bg-surface-hover"
						aria-label="new-cycle-form"
					>
						<h3 className="text-body text-text-primary font-medium">
							New Cycle
						</h3>
						<div>
							<label
								htmlFor="cycle-name"
								className="block text-small text-text-secondary mb-1"
							>
								Name
							</label>
							<input
								id="cycle-name"
								type="text"
								value={newCycleName}
								onChange={(e) => setNewCycleName(e.target.value)}
								required
								className="border border-border-subtle rounded px-3 py-2 w-full bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</div>
						<div>
							<label
								htmlFor="cycle-type"
								className="block text-small text-text-secondary mb-1"
							>
								Type
							</label>
							<select
								id="cycle-type"
								value={newCycleType}
								onChange={(e) =>
									setNewCycleType(
										e.target.value as "quarterly" | "semi_annual" | "annual",
									)
								}
								className="border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
							>
								<option value="quarterly">Quarterly</option>
								<option value="semi_annual">Semi-annual</option>
								<option value="annual">Annual</option>
							</select>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label
									htmlFor="cycle-starts"
									className="block text-small text-text-secondary mb-1"
								>
									Starts On
								</label>
								<input
									id="cycle-starts"
									type="date"
									value={newCycleStartsOn}
									onChange={(e) => setNewCycleStartsOn(e.target.value)}
									required
									className="border border-border-subtle rounded px-3 py-2 w-full bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
								/>
							</div>
							<div>
								<label
									htmlFor="cycle-ends"
									className="block text-small text-text-secondary mb-1"
								>
									Ends On
								</label>
								<input
									id="cycle-ends"
									type="date"
									value={newCycleEndsOn}
									onChange={(e) => setNewCycleEndsOn(e.target.value)}
									required
									className="border border-border-subtle rounded px-3 py-2 w-full bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
								/>
							</div>
							<div>
								<label
									htmlFor="cycle-review-opens"
									className="block text-small text-text-secondary mb-1"
								>
									Review Opens
								</label>
								<input
									id="cycle-review-opens"
									type="date"
									value={newCycleReviewOpens}
									onChange={(e) => setNewCycleReviewOpens(e.target.value)}
									required
									className="border border-border-subtle rounded px-3 py-2 w-full bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
								/>
							</div>
							<div>
								<label
									htmlFor="cycle-review-closes"
									className="block text-small text-text-secondary mb-1"
								>
									Review Closes
								</label>
								<input
									id="cycle-review-closes"
									type="date"
									value={newCycleReviewCloses}
									onChange={(e) => setNewCycleReviewCloses(e.target.value)}
									required
									className="border border-border-subtle rounded px-3 py-2 w-full bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
								/>
							</div>
						</div>
						<button
							type="submit"
							disabled={!newCycleName}
							className="bg-accent-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-accent-600"
						>
							Create Cycle
						</button>
					</form>
				)}

				{cycles.length === 0 ? (
					<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
						<p className="text-text-secondary">No cycles yet.</p>
					</div>
				) : (
					<div className="bg-surface-hover border border-border-subtle rounded-lg overflow-hidden">
						<table className="w-full text-sm border-collapse">
							<thead>
								<tr className="border-b border-border-subtle bg-surface-hover">
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Name
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Type
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Status
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{cycles.map((c) => (
									<tr
										key={c.id}
										className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors"
									>
										<td className="py-3 px-4 text-body text-text-primary font-medium">
											{c.name}
										</td>
										<td className="py-3 px-4 text-body text-text-secondary">
											{CYCLE_TYPE_LABEL[c.type]}
										</td>
										<td className="py-3 px-4">
											<StatusPill
												tone={STATUS_TONE[c.status]}
												label={STATUS_LABEL[c.status]}
											/>
										</td>
										<td className="py-3 px-4 flex gap-2">
											{c.status === "upcoming" && (
												<button
													type="button"
													onClick={() => handleTransition(c.id, "self")}
													className="text-small text-accent-200 hover:text-accent-50 hover:underline"
												>
													Open Self Review
												</button>
											)}
											{c.status === "self_review" && (
												<button
													type="button"
													onClick={() => handleTransition(c.id, "manager")}
													className="text-small text-accent-200 hover:text-accent-50 hover:underline"
												>
													Open Manager Review
												</button>
											)}
											{c.status === "manager_review" && (
												<button
													type="button"
													onClick={() => handleTransition(c.id, "close")}
													className="text-small text-accent-200 hover:text-accent-50 hover:underline"
												>
													Close Cycle
												</button>
											)}
											{c.status === "closed" && (
												<span className="text-small text-text-tertiary">
													Closed
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
