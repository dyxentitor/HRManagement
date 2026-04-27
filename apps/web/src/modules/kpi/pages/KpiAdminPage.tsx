import { useCallback, useEffect, useState } from "react";

import { type KpiCycle, type KpiTemplate, kpiApi } from "../api";

export default function KpiAdminPage() {
	const [cycles, setCycles] = useState<KpiCycle[]>([]);
	const [templates, setTemplates] = useState<KpiTemplate[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// New cycle form state
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

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-8 max-w-4xl">
			<h1 className="text-2xl font-bold">KPI Admin</h1>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{success && <p className="text-green-600">{success}</p>}

			{/* Templates section */}
			<section>
				<h2 className="text-lg font-semibold mb-2">
					Templates ({templates.length})
				</h2>
				{templates.length === 0 ? (
					<p className="text-slate-500 text-sm">No templates yet.</p>
				) : (
					<ul className="space-y-1">
						{templates.map((t) => (
							<li key={t.id} className="text-sm border-b py-1">
								<span className="font-medium">{t.name}</span>
								{t.definitions.length > 0 && (
									<span className="text-slate-500 ml-2">
										({t.definitions.length} KPIs)
									</span>
								)}
							</li>
						))}
					</ul>
				)}
			</section>

			{/* Cycles section */}
			<section>
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-lg font-semibold">Cycles</h2>
					<button
						type="button"
						onClick={() => setShowNewCycle(!showNewCycle)}
						className="text-sm text-blue-600 hover:underline"
					>
						{showNewCycle ? "Cancel" : "+ New Cycle"}
					</button>
				</div>

				{showNewCycle && (
					<form
						onSubmit={handleCreateCycle}
						className="border rounded p-4 space-y-3 mb-4"
						aria-label="new-cycle-form"
					>
						<h3 className="font-medium">New Cycle</h3>
						<div>
							<label htmlFor="cycle-name" className="block text-sm">
								Name
							</label>
							<input
								id="cycle-name"
								type="text"
								value={newCycleName}
								onChange={(e) => setNewCycleName(e.target.value)}
								required
								className="border rounded px-2 py-1 w-full"
							/>
						</div>
						<div>
							<label htmlFor="cycle-type" className="block text-sm">
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
								className="border rounded px-2 py-1"
							>
								<option value="quarterly">Quarterly</option>
								<option value="semi_annual">Semi-annual</option>
								<option value="annual">Annual</option>
							</select>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label htmlFor="cycle-starts" className="block text-sm">
									Starts On
								</label>
								<input
									id="cycle-starts"
									type="date"
									value={newCycleStartsOn}
									onChange={(e) => setNewCycleStartsOn(e.target.value)}
									required
									className="border rounded px-2 py-1 w-full"
								/>
							</div>
							<div>
								<label htmlFor="cycle-ends" className="block text-sm">
									Ends On
								</label>
								<input
									id="cycle-ends"
									type="date"
									value={newCycleEndsOn}
									onChange={(e) => setNewCycleEndsOn(e.target.value)}
									required
									className="border rounded px-2 py-1 w-full"
								/>
							</div>
							<div>
								<label htmlFor="cycle-review-opens" className="block text-sm">
									Review Opens
								</label>
								<input
									id="cycle-review-opens"
									type="date"
									value={newCycleReviewOpens}
									onChange={(e) => setNewCycleReviewOpens(e.target.value)}
									required
									className="border rounded px-2 py-1 w-full"
								/>
							</div>
							<div>
								<label htmlFor="cycle-review-closes" className="block text-sm">
									Review Closes
								</label>
								<input
									id="cycle-review-closes"
									type="date"
									value={newCycleReviewCloses}
									onChange={(e) => setNewCycleReviewCloses(e.target.value)}
									required
									className="border rounded px-2 py-1 w-full"
								/>
							</div>
						</div>
						<button
							type="submit"
							disabled={!newCycleName}
							className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
						>
							Create Cycle
						</button>
					</form>
				)}

				{cycles.length === 0 ? (
					<p className="text-slate-500 text-sm">No cycles yet.</p>
				) : (
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="border-b">
								<th className="text-left py-2">Name</th>
								<th className="text-left py-2">Type</th>
								<th className="text-left py-2">Status</th>
								<th className="text-left py-2">Actions</th>
							</tr>
						</thead>
						<tbody>
							{cycles.map((c) => (
								<tr key={c.id} className="border-b">
									<td className="py-2">{c.name}</td>
									<td className="py-2 capitalize">
										{c.type.replace("_", " ")}
									</td>
									<td className="py-2 capitalize">
										{c.status.replace("_", " ")}
									</td>
									<td className="py-2 flex gap-2">
										{c.status === "upcoming" && (
											<button
												type="button"
												onClick={() => handleTransition(c.id, "self")}
												className="text-blue-600 hover:underline text-xs"
											>
												Open Self Review
											</button>
										)}
										{c.status === "self_review" && (
											<button
												type="button"
												onClick={() => handleTransition(c.id, "manager")}
												className="text-blue-600 hover:underline text-xs"
											>
												Open Manager Review
											</button>
										)}
										{c.status === "manager_review" && (
											<button
												type="button"
												onClick={() => handleTransition(c.id, "close")}
												className="text-blue-600 hover:underline text-xs"
											>
												Close Cycle
											</button>
										)}
										{c.status === "closed" && (
											<span className="text-slate-400 text-xs">Closed</span>
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
