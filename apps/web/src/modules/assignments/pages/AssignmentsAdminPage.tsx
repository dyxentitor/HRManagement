import { BarChart3, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCan } from "@/lib/perm";

import { type AssignmentDef, type AssignmentDetail, assignmentsApi } from "../api";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { AssignmentTrackingPanel } from "../components/AssignmentTrackingPanel";

export default function AssignmentsAdminPage() {
	const canReadOrg = useCan("assignment:read:org");
	const canTeam = useCan("assignment:create:team");
	const [rows, setRows] = useState<AssignmentDef[] | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);
	const [details, setDetails] = useState<Record<string, AssignmentDetail>>({});
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

	async function toggle(id: string) {
		if (openId === id) {
			setOpenId(null);
			return;
		}
		setOpenId(id); // single-open accordion
		if (!details[id]) {
			try {
				const d = await assignmentsApi.retrieve(id);
				setDetails((p) => ({ ...p, [id]: d }));
			} catch {
				/* leave the skeleton; the row can be re-clicked */
			}
		}
	}

	async function revise(id: string) {
		try {
			const res = await assignmentsApi.revise(id);
			toast.success(`Re-issued as v${res.version} · ${res.reopened} to re-acknowledge`);
			const d = await assignmentsApi.retrieve(id);
			setDetails((p) => ({ ...p, [id]: d }));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not re-issue");
		}
	}

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
					{rows.map((a) => {
						const open = openId === a.id;
						return (
							<li key={a.id} className="border-t border-border-subtle first:border-t-0">
								<button
									type="button"
									aria-expanded={open}
									onClick={() => toggle(a.id)}
									className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-elevated/30 rounded-lg"
								>
									<ChevronRight
										className={cn(
											"size-4 shrink-0 text-text-tertiary transition-transform duration-fast",
											open && "rotate-90 text-accent-200",
										)}
									/>
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

								{open &&
									(details[a.id] ? (
										<AssignmentTrackingPanel
											detail={details[a.id]}
											onRevise={() => revise(a.id)}
										/>
									) : (
										<div className="px-4 pb-4">
											<Skeleton className="h-28 rounded-xl" />
										</div>
									))}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
