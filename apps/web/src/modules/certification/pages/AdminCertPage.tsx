import { useCallback, useEffect, useState } from "react";

import {
	type Certification,
	type TrainingPlan,
	certificationApi,
} from "../api";

const EXPIRY_WINDOWS = [
	{ label: "Expiring in 30 days", days: 30 },
	{ label: "Expiring in 60 days", days: 60 },
	{ label: "Expiring in 90 days", days: 90 },
	{ label: "Expiring in 180 days", days: 180 },
	{ label: "All active", days: undefined },
];

export default function AdminCertPage() {
	const [certs, setCerts] = useState<Certification[]>([]);
	const [plans, setPlans] = useState<TrainingPlan[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [selectedWindow, setSelectedWindow] = useState<number | undefined>(90);

	// New plan form
	const [showPlanForm, setShowPlanForm] = useState(false);
	const [newPlanName, setNewPlanName] = useState("");
	const [newPlanDesc, setNewPlanDesc] = useState("");
	const [savingPlan, setSavingPlan] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [c, p] = await Promise.all([
				certificationApi.listCertifications(
					selectedWindow !== undefined
						? { expiring_within_days: selectedWindow }
						: undefined,
				),
				certificationApi.listPlans(),
			]);
			setCerts(c);
			setPlans(p);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load data");
		} finally {
			setLoading(false);
		}
	}, [selectedWindow]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleCreatePlan(e: React.FormEvent) {
		e.preventDefault();
		setSavingPlan(true);
		setError(null);
		try {
			await certificationApi.createPlan({
				name: newPlanName,
				description: newPlanDesc,
			});
			setSuccess("Training plan created!");
			setShowPlanForm(false);
			setNewPlanName("");
			setNewPlanDesc("");
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create plan");
		} finally {
			setSavingPlan(false);
		}
	}

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-8 max-w-5xl">
			<h1 className="text-2xl font-bold">Certification Admin</h1>
			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}
			{success && <p className="text-mint">{success}</p>}

			{/* ── Expiry filter ────────────────────────────────────── */}
			<section className="space-y-3">
				<div className="flex items-center gap-3">
					<h2 className="text-lg font-semibold">Certifications</h2>
					<select
						value={selectedWindow ?? ""}
						onChange={(e) =>
							setSelectedWindow(
								e.target.value ? Number(e.target.value) : undefined,
							)
						}
						className="border border-border-subtle rounded px-2 py-1 text-sm bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
					>
						{EXPIRY_WINDOWS.map(({ label, days }) => (
							<option key={label} value={days ?? ""}>
								{label}
							</option>
						))}
					</select>
				</div>

				{certs.length === 0 ? (
					<p className="text-text-secondary">
						No certifications matching filter.
					</p>
				) : (
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-b border-border-subtle bg-surface-hover">
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Employee
								</th>
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Name
								</th>
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Issuer
								</th>
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Expires
								</th>
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Status
								</th>
							</tr>
						</thead>
						<tbody>
							{certs.map((c) => (
								<tr
									key={c.id}
									className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
								>
									<td className="p-2 font-mono text-xs">{c.employee_id}</td>
									<td className="p-2">{c.name}</td>
									<td className="p-2 text-text-secondary">{c.issuer || "—"}</td>
									<td className="p-2">{c.expires_on ?? "No expiry"}</td>
									<td className="p-2 capitalize">{c.status}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			{/* ── Training plans ────────────────────────────────────── */}
			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold">Training Plans</h2>
					<button
						type="button"
						onClick={() => setShowPlanForm(!showPlanForm)}
						className="px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600 text-sm"
					>
						{showPlanForm ? "Cancel" : "New Plan"}
					</button>
				</div>

				{showPlanForm && (
					<form
						onSubmit={handleCreatePlan}
						className="border border-border-subtle rounded p-4 space-y-3 bg-surface"
					>
						<div>
							<label className="block text-sm font-medium">Plan Name *</label>
							<input
								required
								value={newPlanName}
								onChange={(e) => setNewPlanName(e.target.value)}
								className="mt-1 block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium">Description</label>
							<textarea
								value={newPlanDesc}
								onChange={(e) => setNewPlanDesc(e.target.value)}
								rows={3}
								className="mt-1 block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</div>
						<button
							type="submit"
							disabled={savingPlan}
							className="px-4 py-2 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50"
						>
							{savingPlan ? "Saving…" : "Create"}
						</button>
					</form>
				)}

				{plans.length === 0 ? (
					<p className="text-text-secondary">No training plans created yet.</p>
				) : (
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-b border-border-subtle bg-surface-hover">
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Name
								</th>
								<th className="text-left p-2 text-text-secondary text-xs uppercase tracking-wide">
									Description
								</th>
							</tr>
						</thead>
						<tbody>
							{plans.map((p) => (
								<tr
									key={p.id}
									className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
								>
									<td className="p-2 font-medium">{p.name}</td>
									<td className="p-2 text-text-secondary">
										{p.description || "—"}
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
