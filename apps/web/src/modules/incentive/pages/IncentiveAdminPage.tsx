import { Plus, Sparkles, TrendingUp, Upload, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import {
	type Overview,
	type OverviewActivity,
	type OverviewContributor,
	type OverviewDeadline,
	type OverviewPool,
	incentiveApi,
} from "../api";
import { ApprovalQueue } from "../components/ApprovalQueue";
import { CustomersTable } from "../components/CustomersTable";
import { NewCustomerModal, NewProjectModal, TopUpModal } from "../components/IncentiveModals";
import { ProjectsTable } from "../components/ProjectsTable";

const rm = (v: string) => `RM ${Number(v).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
const md = (v: string) => Number(v).toLocaleString("en-MY", { maximumFractionDigits: 0 });

export default function IncentiveAdminPage() {
	const [ov, setOv] = useState<Overview | null>(null);
	const [modal, setModal] = useState<"project" | "customer" | "topup" | null>(null);
	const canAdmin = useCan("incentive:admin");

	const load = useCallback(async () => {
		setOv(await incentiveApi.overview().catch(() => null));
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	if (!ov) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-40 rounded-2xl" />
				<div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
					{["a", "b", "c", "d", "e", "f"].map((k) => (
						<Skeleton key={k} className="h-24 rounded-2xl" />
					))}
				</div>
				<div className="grid lg:grid-cols-[1.7fr_1fr] gap-4">
					<Skeleton className="h-72 rounded-2xl" />
					<Skeleton className="h-72 rounded-2xl" />
				</div>
			</div>
		);
	}

	const k = ov.kpis;
	const poolPct = Number(k.pool_total)
		? (Number(k.pool_remaining) / Number(k.pool_total)) * 100
		: 0;
	const budgetPct = Number(k.allocated_budget)
		? (Number(k.consumed) / Number(k.allocated_budget)) * 100
		: 0;

	return (
		<div className="space-y-4">
			{/* HERO */}
			<section className="relative rounded-2xl overflow-hidden border border-border-subtle min-h-[140px]">
				<div className="hero-aurora absolute inset-0" aria-hidden />
				<div className="relative z-10 p-6 flex flex-wrap items-center justify-between gap-5">
					<div>
						<h1 className="text-[28px] font-extrabold tracking-tight flex items-center gap-2">
							Incentive <Sparkles className="size-6 text-yellow" aria-hidden />
						</h1>
						<p className="text-small text-text-secondary mt-1.5">
							<b className="text-text-primary">{k.active_projects} active</b> of {k.total_projects}{" "}
							projects · <b className="text-text-primary">{md(k.pool_remaining)} mandays</b>{" "}
							remaining ·{" "}
							{k.pending_claims > 0 ? (
								<b className="text-coral">{k.pending_claims} claims awaiting review</b>
							) : (
								<span className="text-mint">no claims to review</span>
							)}
						</p>
						<div className="flex flex-wrap gap-2 mt-3.5">
							<Button
								onClick={() => setModal("project")}
								className="soft-glow rounded-xl bg-accent-500 text-white"
							>
								<Plus className="size-4 mr-1" /> New project
							</Button>
							<Button variant="outline" className="rounded-xl" onClick={() => setModal("customer")}>
								<UserPlus className="size-4 mr-1" /> Customer
							</Button>
							<Button variant="outline" className="rounded-xl" onClick={() => setModal("topup")}>
								<Upload className="size-4 mr-1" /> Top up pool
							</Button>
						</div>
					</div>
					<div className="text-right">
						<p className="text-label text-accent-200">Payouts · this quarter</p>
						<p className="text-[30px] font-extrabold tracking-tight">{rm(k.payout_rm_quarter)}</p>
						<p className="text-small text-text-tertiary mt-0.5">
							{k.approved_claims} approved claims
						</p>
					</div>
				</div>
			</section>

			{/* KPI ROW */}
			<div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
				<Kpi
					label="Active projects"
					value={String(k.active_projects)}
					sub={`of ${k.total_projects} · ${k.closed_projects} closed`}
				/>
				<Kpi
					label="Mandays remaining"
					value={md(k.pool_remaining)}
					pct={poolPct}
					grad="from-mint to-sky"
					sub={`of ${md(k.pool_total)} pool`}
				/>
				<Kpi
					label="Allocated budget"
					value={md(k.allocated_budget)}
					pct={budgetPct}
					grad="from-lavender to-accent-500"
					sub={`${md(k.consumed)} consumed`}
				/>
				<Kpi
					label="Pending claims"
					value={String(k.pending_claims)}
					danger={k.pending_claims > 0}
					sub="to review"
				/>
				<Kpi
					label="Approved"
					value={String(k.approved_claims)}
					sub={`${k.rejected_claims} rejected`}
				/>
				<Kpi
					label="SOC-enabled"
					value={String(k.soc_projects)}
					sub={`of ${k.active_projects} active`}
				/>
			</div>

			{/* WORKSPACE */}
			<div className="grid lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
				<div className="space-y-4">
					<PoolGauges pools={ov.pools} />
					{canAdmin && <CustomersTable onChanged={load} />}
					<ProjectsTable projects={ov.projects} onChanged={load} />
					<ConsumptionChart data={ov.consumption} />
				</div>
				<div className="space-y-4">
					<ApprovalQueue onReviewed={load} />
					<ClaimDonut breakdown={ov.claim_breakdown} />
					<TopContributors rows={ov.top_contributors} />
					<UpcomingDeadlines rows={ov.deadlines} />
					<ActivityFeed rows={ov.recent_activity} />
				</div>
			</div>

			<NewProjectModal
				open={modal === "project"}
				onOpenChange={(o) => !o && setModal(null)}
				onDone={load}
				pools={ov.pools}
			/>
			<NewCustomerModal
				open={modal === "customer"}
				onOpenChange={(o) => !o && setModal(null)}
				onDone={load}
			/>
			<TopUpModal
				open={modal === "topup"}
				onOpenChange={(o) => !o && setModal(null)}
				onDone={load}
				pools={ov.pools}
			/>
		</div>
	);
}

function Kpi({
	label,
	value,
	sub,
	pct,
	grad,
	danger,
}: {
	label: string;
	value: string;
	sub?: string;
	pct?: number;
	grad?: string;
	danger?: boolean;
}) {
	return (
		<div className={cn("glass-surface rounded-2xl p-3.5", danger && "border-coral/30")}>
			<p className="text-label text-text-tertiary">{label}</p>
			<p className={cn("text-2xl font-bold tracking-tight mt-0.5", danger && "text-coral")}>
				{value}
			</p>
			{pct !== undefined && (
				<div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden mt-2">
					<div
						className={cn("h-full rounded-full bg-gradient-to-r", grad)}
						style={{ width: `${Math.min(100, pct)}%` }}
					/>
				</div>
			)}
			{sub && <p className="text-[10px] text-text-tertiary mt-1.5">{sub}</p>}
		</div>
	);
}

function PoolGauges({ pools }: { pools: OverviewPool[] }) {
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-3 flex items-center justify-between">
				Customer pools{" "}
				<span className="text-[10px] text-text-tertiary">{pools.length} customers</span>
			</h3>
			{pools.length === 0 ? (
				<p className="text-small text-text-tertiary py-3">
					No customers yet — add one to load a pool.
				</p>
			) : (
				<div className="space-y-3">
					{pools.map((p) => {
						const grad =
							p.pct_used >= 85
								? "from-coral to-peach"
								: p.pct_used >= 60
									? "from-yellow to-peach"
									: "from-accent-500 to-lavender";
						return (
							<div key={p.id}>
								<div className="flex justify-between text-small mb-1">
									<span>
										<b className="font-medium">{p.name}</b>{" "}
										<span className="text-text-tertiary text-[10px]">
											· {p.project_count} projects
										</span>
									</span>
									<span className="text-text-tertiary text-[10px]">
										{md(p.remaining)} / {md(p.total)} md left
									</span>
								</div>
								<div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
									<div
										className={cn("h-full rounded-full bg-gradient-to-r", grad)}
										style={{ width: `${Math.min(100, p.pct_used)}%` }}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function ConsumptionChart({ data }: { data: { quarter: string; mandays: string }[] }) {
	const max = Math.max(1, ...data.map((d) => Number(d.mandays)));
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-3 flex items-center gap-1.5">
				<TrendingUp className="size-4 text-accent-200" /> Manday consumption
				<span className="text-[10px] text-text-tertiary font-normal ml-auto">last 4 quarters</span>
			</h3>
			<div className="flex items-end gap-4 h-24 px-1">
				{data.map((d, i) => {
					const h = (Number(d.mandays) / max) * 100;
					const last = i === data.length - 1;
					return (
						<div key={d.quarter} className="flex-1 text-center flex flex-col justify-end">
							<div
								className={cn(
									"w-full rounded-t-md bg-gradient-to-b",
									last ? "from-mint to-mint/20" : "from-accent-500 to-accent-500/20",
								)}
								style={{ height: `${Math.max(4, h)}%` }}
							/>
							<p className={cn("text-[10px] mt-1.5", last ? "text-mint" : "text-text-tertiary")}>
								{d.quarter.split("-")[1]} · {md(d.mandays)}
							</p>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ClaimDonut({
	breakdown,
}: { breakdown: { approved: number; pending: number; rejected: number } }) {
	const total = breakdown.approved + breakdown.pending + breakdown.rejected;
	const C = 100; // circumference units
	const seg = (n: number) => (total ? (n / total) * C : 0);
	const aLen = seg(breakdown.approved);
	const pLen = seg(breakdown.pending);
	const rLen = seg(breakdown.rejected);
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-3">Claims breakdown</h3>
			{total === 0 ? (
				<p className="text-small text-text-tertiary py-3">No claims yet.</p>
			) : (
				<div className="flex items-center gap-4">
					<svg width="86" height="86" viewBox="0 0 42 42" role="img">
						<title>Claims breakdown</title>
						<circle
							cx="21"
							cy="21"
							r="15.9"
							fill="none"
							stroke="rgba(255,255,255,.06)"
							strokeWidth="5"
						/>
						<circle
							cx="21"
							cy="21"
							r="15.9"
							fill="none"
							stroke="#5fd0a0"
							strokeWidth="5"
							strokeDasharray={`${aLen} ${C - aLen}`}
							strokeDashoffset="25"
							strokeLinecap="round"
						/>
						<circle
							cx="21"
							cy="21"
							r="15.9"
							fill="none"
							stroke="#e9c469"
							strokeWidth="5"
							strokeDasharray={`${pLen} ${C - pLen}`}
							strokeDashoffset={`${25 - aLen}`}
							strokeLinecap="round"
						/>
						<circle
							cx="21"
							cy="21"
							r="15.9"
							fill="none"
							stroke="#f78a8a"
							strokeWidth="5"
							strokeDasharray={`${rLen} ${C - rLen}`}
							strokeDashoffset={`${25 - aLen - pLen}`}
							strokeLinecap="round"
						/>
						<text x="21" y="22" textAnchor="middle" fill="#f1f3f8" fontSize="8" fontWeight="700">
							{total}
						</text>
					</svg>
					<div className="space-y-1.5 text-small">
						<Legend color="#5fd0a0" label="Approved" n={breakdown.approved} />
						<Legend color="#e9c469" label="Pending" n={breakdown.pending} />
						<Legend color="#f78a8a" label="Rejected" n={breakdown.rejected} />
					</div>
				</div>
			)}
		</div>
	);
}
function Legend({ color, label, n }: { color: string; label: string; n: number }) {
	return (
		<div className="flex items-center gap-2 text-text-secondary">
			<span className="size-2 rounded-sm" style={{ background: color }} /> {label} · {n}
		</div>
	);
}

function TopContributors({ rows }: { rows: OverviewContributor[] }) {
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-3">Top contributors</h3>
			{rows.length === 0 ? (
				<p className="text-small text-text-tertiary py-3">No earnings yet.</p>
			) : (
				<div className="space-y-1">
					{rows.map((r, i) => (
						<div key={r.employee_id} className="flex items-center gap-2.5 py-1.5">
							<span className="text-[10px] text-text-tertiary w-3">{i + 1}</span>
							<span className="size-6 rounded-full bg-gradient-to-br from-lavender to-sky" />
							<div className="flex-1 min-w-0">
								<p className="text-small text-text-primary truncate">{r.name}</p>
								<p className="text-[10px] text-text-tertiary truncate">{r.department}</p>
							</div>
							<div className="text-right">
								<p className="text-small font-medium">{md(r.mandays)} md</p>
								<p className="text-[10px] text-text-tertiary">{rm(r.rm)}</p>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function UpcomingDeadlines({ rows }: { rows: OverviewDeadline[] }) {
	if (rows.length === 0) return null;
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-3">Upcoming deadlines</h3>
			<div className="space-y-1">
				{rows.map((d) => (
					<div key={d.id} className="flex items-center justify-between py-1.5 text-small">
						<div className="min-w-0">
							<p className="text-text-primary truncate">{d.name}</p>
							<p className="text-[10px] text-text-tertiary truncate">{d.customer_name}</p>
						</div>
						<span
							className={cn(
								"text-[10px] font-semibold",
								d.overdue ? "text-coral" : "text-text-tertiary",
							)}
						>
							{d.overdue ? "overdue · " : ""}
							{d.deadline}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function ActivityFeed({ rows }: { rows: OverviewActivity[] }) {
	const tone: Record<string, string> = {
		pool_topup: "bg-sky",
		claim_payout: "bg-mint",
		reclaimed: "bg-coral",
	};
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-3">Recent activity</h3>
			{rows.length === 0 ? (
				<p className="text-small text-text-tertiary py-3">No activity yet.</p>
			) : (
				<div className="space-y-0.5">
					{rows.map((a, i) => (
						<div key={`${a.created_at}-${i}`} className="flex items-center gap-2.5 py-1.5">
							<span className={cn("size-1.5 rounded-full", tone[a.type] ?? "bg-lavender")} />
							<p className="flex-1 text-[11px] text-text-secondary truncate">
								<b className="text-text-primary font-medium">{a.label_type}</b> · {md(a.mandays)} md
								{a.target ? ` · ${a.target}` : ""}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
