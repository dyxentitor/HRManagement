import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/perm";

import { type Claim, type Customer, type Project, incentiveApi } from "../api";

const CLAIM_TONE = {
	pending: "yellow",
	approved: "mint",
	rejected: "coral",
	cancelled: "lavender",
} as const;

export default function IncentiveAdminPage() {
	const isAdmin = useCan("incentive:admin");
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [projects, setProjects] = useState<Project[]>([]);
	const [claims, setClaims] = useState<Claim[]>([]);
	const [custName, setCustName] = useState("");
	const [pj, setPj] = useState({ customer: "", name: "", budget_mandays: "", include_soc: false });

	const load = useCallback(async () => {
		const [cu, prj, cl] = await Promise.all([
			isAdmin ? incentiveApi.customers.list().catch(() => []) : Promise.resolve([]),
			incentiveApi.projects.list().catch(() => []),
			incentiveApi.claims.list().catch(() => []),
		]);
		setCustomers(cu);
		setProjects(prj);
		setClaims(cl);
	}, [isAdmin]);

	useEffect(() => {
		void load();
	}, [load]);

	async function createCustomer() {
		if (!custName.trim()) return;
		try {
			await incentiveApi.customers.create({ name: custName.trim() });
			setCustName("");
			toast.success("Customer added.");
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed.");
		}
	}

	async function topUp(c: Customer) {
		const raw = window.prompt(`Add mandays to ${c.name}'s pool:`, "100");
		if (!raw) return;
		try {
			await incentiveApi.customers.topUp(c.id, raw);
			toast.success(`Added ${raw} mandays.`);
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Top-up failed.");
		}
	}

	async function openProject() {
		if (!pj.customer || !pj.name || !pj.budget_mandays) {
			toast.error("Customer, name and budget are required.");
			return;
		}
		try {
			await incentiveApi.projects.create(pj);
			setPj({ customer: "", name: "", budget_mandays: "", include_soc: false });
			toast.success("Project opened.");
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not open project.");
		}
	}

	async function toggleSoc(p: Project) {
		try {
			await incentiveApi.projects.update(p.id, { include_soc: !p.include_soc });
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed.");
		}
	}

	async function review(c: Claim, approve: boolean) {
		try {
			if (approve) {
				await incentiveApi.claims.approve(c.id);
				toast.success("Claim approved.");
			} else {
				const reason = window.prompt("Reason for rejection:") ?? "";
				await incentiveApi.claims.reject(c.id, reason);
				toast.success("Claim rejected.");
			}
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Review failed.");
		}
	}

	const pending = claims.filter((c) => c.status === "pending");

	return (
		<div className="space-y-6">
			<PageHeader
				title="Incentive"
				subtitle="Customer mandays pools, projects, and claim approvals."
			/>

			{/* Customers + pools (admin only) */}
			{isAdmin && (
				<section className="glass-surface rounded-2xl p-4 space-y-3">
					<p className="text-label text-text-tertiary">Customers &amp; mandays pools</p>
					<div className="flex gap-2">
						<input
							value={custName}
							onChange={(e) => setCustName(e.target.value)}
							placeholder="New customer name"
							aria-label="Customer name"
							className="flex-1 bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
						/>
						<Button type="button" onClick={createCustomer} className="bg-accent-500 text-white">
							Add
						</Button>
					</div>
					<div className="space-y-2">
						{customers.map((c) => (
							<div
								key={c.id}
								className="flex items-center justify-between gap-4 rounded-xl bg-black/20 px-3 py-2"
							>
								<div>
									<p className="text-body text-text-primary">{c.name}</p>
									<p className="text-small text-text-tertiary">
										{c.mandays_remaining} / {c.mandays_total} mandays remaining
									</p>
								</div>
								<Button type="button" variant="ghost" size="sm" onClick={() => topUp(c)}>
									Top up
								</Button>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Open a project */}
			<section className="glass-surface rounded-2xl p-4 space-y-3">
				<p className="text-label text-text-tertiary">Open a project</p>
				<div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
					<select
						value={pj.customer}
						onChange={(e) => setPj({ ...pj, customer: e.target.value })}
						aria-label="Customer"
						className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body text-text-secondary"
					>
						<option value="">Customer…</option>
						{customers.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
					<input
						value={pj.name}
						onChange={(e) => setPj({ ...pj, name: e.target.value })}
						placeholder="Project name"
						aria-label="Project name"
						className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
					/>
					<input
						type="number"
						min="0"
						step="0.25"
						value={pj.budget_mandays}
						onChange={(e) => setPj({ ...pj, budget_mandays: e.target.value })}
						placeholder="Budget (md)"
						aria-label="Budget mandays"
						className="bg-canvas border border-border-subtle rounded-md px-3 py-2 text-body"
					/>
					<Button type="button" onClick={openProject} className="bg-accent-500 text-white">
						Open
					</Button>
				</div>
				<label className="flex items-center gap-2 text-small text-text-secondary">
					<input
						type="checkbox"
						checked={pj.include_soc}
						onChange={(e) => setPj({ ...pj, include_soc: e.target.checked })}
					/>
					Visible to SOC team
				</label>
			</section>

			{/* Projects */}
			<section className="space-y-2">
				<p className="text-label text-text-tertiary">Projects</p>
				{projects.length === 0 ? (
					<p className="text-small text-text-tertiary">No projects yet.</p>
				) : (
					projects.map((p) => (
						<div
							key={p.id}
							className="glass-surface rounded-xl p-3 flex items-center justify-between gap-4"
						>
							<div>
								<p className="text-body text-text-primary">
									{p.name} <span className="text-text-tertiary">· {p.customer_name}</span>
								</p>
								<p className="text-small text-text-tertiary">
									{p.mandays_remaining} / {p.budget_mandays} mandays left
								</p>
							</div>
							<Button type="button" variant="ghost" size="sm" onClick={() => toggleSoc(p)}>
								{p.include_soc ? "SOC: on" : "SOC: off"}
							</Button>
						</div>
					))
				)}
			</section>

			{/* Pending claims */}
			<section className="space-y-2">
				<p className="text-label text-text-tertiary">Pending claims</p>
				{pending.length === 0 ? (
					<p className="text-small text-text-tertiary">Nothing to review.</p>
				) : (
					pending.map((c) => (
						<div
							key={c.id}
							className="glass-surface rounded-xl p-3 flex items-center justify-between gap-4"
						>
							<div>
								<p className="text-body text-text-primary">{c.project_name}</p>
								<p className="text-small text-text-tertiary">{c.mandays} mandays</p>
							</div>
							<div className="flex items-center gap-2">
								<StatusPill tone={CLAIM_TONE[c.status]} label={c.status} />
								<Button type="button" size="sm" onClick={() => review(c, true)}>
									Approve
								</Button>
								<Button type="button" variant="ghost" size="sm" onClick={() => review(c, false)}>
									Reject
								</Button>
							</div>
						</div>
					))
				)}
			</section>
		</div>
	);
}
