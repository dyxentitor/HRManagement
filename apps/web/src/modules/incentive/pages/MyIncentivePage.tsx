import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";

import { type Bond, type Claim, type Project, incentiveApi } from "../api";

const CLAIM_TONE = {
	pending: "yellow",
	approved: "mint",
	rejected: "coral",
	cancelled: "lavender",
} as const;

export default function MyIncentivePage() {
	const [bond, setBond] = useState<Bond | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [claims, setClaims] = useState<Claim[]>([]);
	const [projectId, setProjectId] = useState("");
	const [mandays, setMandays] = useState("");
	const [note, setNote] = useState("");
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		const [bonds, pj, cl] = await Promise.all([
			incentiveApi.bonds.list().catch(() => []),
			incentiveApi.projects.list().catch(() => []),
			incentiveApi.claims.list().catch(() => []),
		]);
		setBond(bonds[0] ?? null);
		setProjects(pj.filter((p) => p.status === "open"));
		setClaims(cl);
		setLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function acceptBond() {
		if (!bond) return;
		try {
			await incentiveApi.bonds.accept(bond.id);
			toast.success("Bond accepted — you can now claim mandays.");
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not accept bond.");
		}
	}

	async function submitClaim() {
		if (!projectId || !mandays) {
			toast.error("Pick a project and enter mandays.");
			return;
		}
		try {
			await incentiveApi.claims.create({ project: projectId, mandays, note });
			toast.success("Claim submitted.");
			setProjectId("");
			setMandays("");
			setNote("");
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not submit claim.");
		}
	}

	const eligible = bond?.is_active ?? false;

	return (
		<div className="space-y-6">
			<PageHeader title="My Mandays" subtitle="Claim mandays for the projects you contribute to." />

			{/* Bond / eligibility */}
			<section className="glass-surface rounded-2xl p-4 flex items-center justify-between gap-4">
				<div>
					<p className="text-label text-text-tertiary">Mandays bond</p>
					{bond ? (
						<p className="text-small text-text-secondary mt-0.5">
							{bond.period_start} → {bond.period_end}
						</p>
					) : (
						<p className="text-small text-text-tertiary mt-0.5">
							No bond on file — ask HR to set one up.
						</p>
					)}
				</div>
				{bond && !bond.accepted_at ? (
					<Button type="button" onClick={acceptBond} className="bg-accent-500 text-white">
						Accept bond
					</Button>
				) : (
					<StatusPill
						tone={eligible ? "mint" : "lavender"}
						label={eligible ? "Eligible" : "Not eligible"}
					/>
				)}
			</section>

			{/* Submit a claim */}
			<section className="glass-surface rounded-2xl p-4 space-y-3">
				<p className="text-label text-text-tertiary">Submit a claim</p>
				<div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
					<select
						value={projectId}
						onChange={(e) => setProjectId(e.target.value)}
						aria-label="Project"
						disabled={!eligible}
						className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body text-text-secondary"
					>
						<option value="">Select a project…</option>
						{projects.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name} · {p.mandays_remaining} md left
							</option>
						))}
					</select>
					<input
						type="number"
						min="0"
						step="0.25"
						value={mandays}
						onChange={(e) => setMandays(e.target.value)}
						placeholder="Mandays"
						aria-label="Mandays"
						disabled={!eligible}
						className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
					/>
					<Button
						type="button"
						onClick={submitClaim}
						disabled={!eligible}
						className="bg-accent-500 text-white"
					>
						Claim
					</Button>
				</div>
				<input
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder="What did you do? (optional)"
					aria-label="Note"
					disabled={!eligible}
					className="w-full bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
				/>
				{!eligible && (
					<p className="text-small text-text-tertiary">
						You need an accepted, active bond before you can claim.
					</p>
				)}
			</section>

			{/* My claims */}
			<section className="space-y-2">
				<p className="text-label text-text-tertiary">My claims</p>
				{loading ? (
					<p className="text-small text-text-tertiary">Loading…</p>
				) : claims.length === 0 ? (
					<p className="text-small text-text-tertiary">No claims yet.</p>
				) : (
					<div className="space-y-2">
						{claims.map((c) => (
							<div
								key={c.id}
								className="glass-surface rounded-xl p-3 flex items-center justify-between gap-4"
							>
								<div>
									<p className="text-body text-text-primary">{c.project_name}</p>
									<p className="text-small text-text-tertiary">
										{c.mandays} mandays{c.billing_quarter ? ` · ${c.billing_quarter}` : ""}
									</p>
								</div>
								<StatusPill tone={CLAIM_TONE[c.status]} label={c.status} />
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
