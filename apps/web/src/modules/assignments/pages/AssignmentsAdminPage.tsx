import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/lib/perm";

import { type AssignmentDef, type AssignmentDetail, assignmentsApi } from "../api";
import { CreateAssignmentDrawer } from "../components/CreateAssignmentDrawer";

export default function AssignmentsAdminPage() {
	const canReadOrg = useCan("assignment:read:org");
	const canTeam = useCan("assignment:create:team");
	const [rows, setRows] = useState<AssignmentDef[] | null>(null);
	const [drawer, setDrawer] = useState(false);
	const [detail, setDetail] = useState<AssignmentDetail | null>(null);

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
					<Button size="sm" className="soft-glow rounded-xl" onClick={() => setDrawer(true)}>
						<Plus className="size-4 mr-1" /> New assignment
					</Button>
				}
			/>

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

			<CreateAssignmentDrawer
				open={drawer}
				onClose={() => setDrawer(false)}
				onCreated={load}
				managerScoped={!canReadOrg && canTeam}
			/>

			{detail && (
				<div className="glass-surface rounded-2xl p-4">
					<header className="flex items-center justify-between mb-2">
						<h2 className="text-h3 text-text-primary">{detail.title}</h2>
						<button
							type="button"
							className="text-small text-text-tertiary"
							onClick={() => setDetail(null)}
						>
							Close
						</button>
					</header>
					<p className="text-small text-text-secondary mb-3">
						<b className="text-mint">{detail.summary.done}</b> / {detail.summary.total} done ·{" "}
						<b className="text-coral">{detail.summary.overdue}</b> overdue
					</p>
					<ul className="space-y-1 text-small">
						{detail.recipients.map((r) => (
							<li
								key={r.id}
								className="flex items-center justify-between glass-surface rounded-lg px-3 py-1.5"
							>
								<span className="text-text-secondary font-mono text-[11px] truncate">
									{r.employee_id}
								</span>
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
			)}
		</div>
	);
}
