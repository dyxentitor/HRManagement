import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import { type CertStatus, type Certification, type TrainingPlan, certificationApi } from "../api";

const STATUS_TONE: Record<CertStatus, "mint" | "coral"> = {
	active: "mint",
	expired: "coral",
	revoked: "coral",
};

const STATUS_LABEL: Record<CertStatus, string> = {
	active: "Active",
	expired: "Expired",
	revoked: "Revoked",
};

const EXPIRY_WINDOWS = [
	{ label: "Expiring in 30 days", days: 30 },
	{ label: "Expiring in 60 days", days: 60 },
	{ label: "Expiring in 90 days", days: 90 },
	{ label: "Expiring in 180 days", days: 180 },
	{ label: "All active", days: undefined },
];

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function shortId(id: string): string {
	return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

export default function AdminCertPage() {
	const [certs, setCerts] = useState<Certification[]>([]);
	const [plans, setPlans] = useState<TrainingPlan[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [selectedWindow, setSelectedWindow] = useState<number | undefined>(90);

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
					selectedWindow !== undefined ? { expiring_within_days: selectedWindow } : undefined,
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

	if (loading) return <p className="text-text-tertiary p-4">Loading…</p>;

	return (
		<div className="space-y-8 max-w-5xl mx-auto">
			<PageHeader breadcrumb="Certifications" title="Certification Admin" />

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
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-h2 text-text-primary">Certifications</h2>
					<select
						value={selectedWindow ?? ""}
						onChange={(e) => setSelectedWindow(e.target.value ? Number(e.target.value) : undefined)}
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
					<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
						<p className="text-text-secondary">No certifications matching filter.</p>
					</div>
				) : (
					<div className="bg-surface-hover border border-border-subtle rounded-lg overflow-hidden">
						<table className="w-full text-sm border-collapse">
							<thead>
								<tr className="border-b border-border-subtle bg-surface-hover">
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Employee
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Name
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Issuer
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Expires
									</th>
									<th className="text-left py-3 px-4 text-label uppercase text-text-tertiary font-semibold tracking-wide">
										Status
									</th>
								</tr>
							</thead>
							<tbody>
								{certs.map((c) => (
									<tr
										key={c.id}
										className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors"
									>
										<td
											className="py-3 px-4 font-mono text-xs text-text-tertiary"
											title={c.employee_id}
										>
											{shortId(c.employee_id)}
										</td>
										<td className="py-3 px-4 text-body text-text-primary font-medium">{c.name}</td>
										<td className="py-3 px-4 text-body text-text-secondary">{c.issuer || "—"}</td>
										<td className="py-3 px-4 text-body text-text-primary">
											{c.expires_on ? formatDate(c.expires_on) : "No expiry"}
										</td>
										<td className="py-3 px-4">
											<StatusPill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status]} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-h2 text-text-primary">Training Plans</h2>
					<button
						type="button"
						onClick={() => setShowPlanForm(!showPlanForm)}
						className="bg-accent-500 text-white px-4 py-2 rounded text-sm hover:bg-accent-600"
					>
						{showPlanForm ? "Cancel" : "New Plan"}
					</button>
				</div>

				{showPlanForm && (
					<form
						onSubmit={handleCreatePlan}
						className="border border-border-subtle rounded-lg p-4 space-y-3 bg-surface-hover"
					>
						<div>
							<label htmlFor="plan-name" className="block text-small text-text-secondary mb-1">
								Plan Name *
							</label>
							<input
								id="plan-name"
								required
								value={newPlanName}
								onChange={(e) => setNewPlanName(e.target.value)}
								className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</div>
						<div>
							<label htmlFor="plan-desc" className="block text-small text-text-secondary mb-1">
								Description
							</label>
							<textarea
								id="plan-desc"
								value={newPlanDesc}
								onChange={(e) => setNewPlanDesc(e.target.value)}
								rows={3}
								className="block w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</div>
						<button
							type="submit"
							disabled={savingPlan}
							className="bg-accent-500 text-white px-4 py-2 rounded text-sm hover:bg-accent-600 disabled:opacity-50"
						>
							{savingPlan ? "Saving…" : "Create"}
						</button>
					</form>
				)}

				{plans.length === 0 ? (
					<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
						<p className="text-text-secondary">No training plans created yet.</p>
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
										Description
									</th>
								</tr>
							</thead>
							<tbody>
								{plans.map((p) => (
									<tr
										key={p.id}
										className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors"
									>
										<td className="py-3 px-4 text-body text-text-primary font-medium">{p.name}</td>
										<td className="py-3 px-4 text-body text-text-secondary">
											{p.description || "—"}
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
