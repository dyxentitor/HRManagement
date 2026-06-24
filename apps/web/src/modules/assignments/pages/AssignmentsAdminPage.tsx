import { BarChart3, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/lib/perm";

import { type AssignmentDef, type AssignmentDetail, assignmentsApi } from "../api";
import { AnalyticsPanel } from "../components/AnalyticsPanel";

export default function AssignmentsAdminPage() {
	const canReadOrg = useCan("assignment:read:org");
	const canTeam = useCan("assignment:create:team");
	const [rows, setRows] = useState<AssignmentDef[] | null>(null);
	const [detail, setDetail] = useState<AssignmentDetail | null>(null);
	const [showAnalytics, setShowAnalytics] = useState(false);

	const load = useCallback(async () => {
		try {
			setRows(await assignmentsApi.list());
		} catch {
			setRows([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (!canReadOrg && !canTeam) {
		return (
			<div className="space-y-4">
				<PageHeader breadcrumb="Assignments" title="Assignments" />
				<p className="text-small text-text-tertiary glass-surface rounded-xl p-6">
					You don't have permission to manage assignments.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<PageHeader
				breadcrumb="Assignments"
				title="Assignments"
				subtitle="Assign mandatory tasks and track completion"
				actions={
					<div className="flex items-center gap-2">
						{canReadOrg && (
							<Button
								size="sm"
								variant="outline"
								className="rounded-xl"
								onClick={() => setShowAnalytics((v) => !v)}
							>
								<BarChart3 className="size-4 mr-1" /> {showAnalytics ? "Hide" : "Analytics"}
							</Button>
						)}
						<Button asChild size="sm" className="soft-glow rounded-xl">
							<Link to="/admin/assignments/new">
								<Plus className="size-4 mr-1" /> New assignment
							</Link>
						</Button>
					</div>
				}
			/>

			{showAnalytics && canReadOrg && <AnalyticsPanel />}

			{rows === null ? (
				<Skeleton className="h-48 rounded-2xl" />
			) : rows.length === 0 ? (
				<p className="text-small text-text-tertiary glass-surface rounded-xl p-8 text-center">
					No assignments yet. Create one to get started.
				</p>
			) : (
				<ul className="glass-surface rounded-2xl px-1.5 py-1">
					{rows.map((a) => (
						<li key={a.id}>
							<button
								type="button"
								onClick={() => assignmentsApi.retrieve(a.id).then(setDetail)}
								className="w-full flex items-center gap-3 px-3 py-2.5 border-t border-border-subtle first:border-t-0 text-left hover:bg-surface-elevated/30"
							>
								<div className="min-w-0 flex-1">
									<p className="text-small text-text-primary truncate">{a.title}</p>
									<p className="text-[11px] text-text-tertiary capitalize">
										{a.type} · {a.status}
										{a.default_due_date ? ` · due ${a.default_due_date}` : ""}
										{a.recurrence && a.recurrence !== "none" ? ` · ↻ ${a.recurrence}` : ""}
									</p>
								</div>
								<StatusPill
									tone={a.status === "published" ? "mint" : "lavender"}
									label={a.status}
								/>
							</button>
						</li>
					))}
				</ul>
			)}

			{detail && (
				<DetailPanel
					open={!!detail}
					onClose={() => setDetail(null)}
					title={detail.title}
					footer={
						detail.type === "acknowledge" ? (
							<Button
								variant="outline"
								className="w-full rounded-xl"
								onClick={async () => {
									const res = await assignmentsApi.revise(detail.id);
									toast.success(`Re-issued as v${res.version} · ${res.reopened} to re-acknowledge`);
									setDetail(await assignmentsApi.retrieve(detail.id));
								}}
							>
								Re-issue (new version)
							</Button>
						) : undefined
					}
				>
					<div className="space-y-4">
						{/* progress summary */}
						<div className="space-y-2">
							<div className="flex items-baseline justify-between">
								<p className="text-h2 text-text-primary tabular-nums">
									{rate(detail.summary.done, detail.summary.total)}%
								</p>
								<p className="text-[11px] text-text-tertiary">
									{detail.summary.done}/{detail.summary.total} done
									{detail.summary.overdue > 0 && (
										<span className="text-coral"> · {detail.summary.overdue} overdue</span>
									)}
									{detail.version && detail.version > 1 ? (
										<span className="text-text-tertiary"> · v{detail.version}</span>
									) : null}
								</p>
							</div>
							<div className="h-2 rounded-full bg-surface/60 overflow-hidden">
								<div
									className="h-full bg-mint transition-all"
									style={{ width: `${rate(detail.summary.done, detail.summary.total)}%` }}
								/>
							</div>
						</div>

						{/* recipient list */}
						<ul className="space-y-1.5">
							{detail.recipients.map((r) => (
								<li
									key={r.id}
									className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-surface/40"
								>
									<span className="size-7 shrink-0 rounded-full grid place-items-center bg-accent-500/15 text-accent-100 text-[10px] font-semibold uppercase">
										{initials(r.employee_name)}
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-small text-text-primary truncate">
											{r.employee_name || "Unknown employee"}
										</p>
										<p className="text-[10px] text-text-tertiary truncate">
											{r.status === "completed" && r.completed_at
												? `Completed ${new Date(r.completed_at).toLocaleDateString()}`
												: r.employee_code || "—"}
										</p>
									</div>
									<StatusPill
										tone={
											r.effective_status === "completed"
												? "mint"
												: r.effective_status === "overdue"
													? "coral"
													: "yellow"
										}
										label={r.effective_status}
									/>
								</li>
							))}
						</ul>
					</div>
				</DetailPanel>
			)}
		</div>
	);
}

function rate(done: number, total: number): number {
	return total ? Math.round((done / total) * 100) : 0;
}

function initials(name?: string): string {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/);
	return (
		(
			(parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")
		).toUpperCase() || "?"
	);
}
