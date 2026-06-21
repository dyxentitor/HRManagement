import { GraduationCap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type TrainingAssignment, certificationApi } from "../api";
import { type Tone, assignmentStatusView, fmtDate, trainingSummary } from "../lib/cert-ui";
import { GrowthHero } from "./GrowthHero";

const BAR: Record<Tone, string> = {
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
	lavender: "bg-lavender",
};

function AssignmentRow({
	a,
	onComplete,
}: {
	a: TrainingAssignment;
	onComplete: (id: string) => void;
}) {
	const sv = assignmentStatusView(a);
	return (
		<li className="flex items-center gap-3 px-3 py-2.5 border-t border-border-subtle first:border-t-0">
			<span className="size-9 rounded-xl grid place-items-center bg-surface-elevated/50 shrink-0">
				<GraduationCap className="size-4 text-text-secondary" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">{a.plan_name || "Training"}</p>
				<p className="text-[11px] text-text-tertiary">
					{a.status === "completed"
						? `completed ${fmtDate(a.completed_at)}`
						: `due ${fmtDate(a.due_date)}`}
				</p>
				<div className="h-1 rounded-full bg-surface-elevated/60 overflow-hidden mt-1.5">
					<span
						className={cn("block h-full rounded-full", BAR[sv.tone])}
						style={{ width: `${sv.pct}%` }}
					/>
				</div>
			</div>
			<div className="text-right shrink-0 flex flex-col items-end gap-1.5">
				<StatusPill tone={sv.tone} label={sv.label} />
				{a.status !== "completed" && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 px-2.5 text-[11px]"
						onClick={() => onComplete(a.id)}
					>
						Complete
					</Button>
				)}
			</div>
		</li>
	);
}

export function TrainingColumn() {
	const [items, setItems] = useState<TrainingAssignment[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			setItems(await certificationApi.myAssignments());
		} catch {
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function complete(id: string) {
		try {
			await certificationApi.completeAssignment(id);
			toast.success("Training marked complete");
			await refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not mark complete");
		}
	}

	const s = trainingSummary(items);

	if (loading) return <Skeleton className="h-[244px] rounded-2xl" />;

	return (
		<div className="flex flex-col gap-3">
			<p className="layer-eyebrow">／ My Training</p>
			<GrowthHero
				accent="sky"
				eyebrow="Learning"
				headline={s.total === 0 ? "No assignments" : `${s.done} of ${s.total} complete`}
				context={`${s.total} assignment${s.total === 1 ? "" : "s"} · ${s.overdue} overdue`}
				ringSegments={[
					{ value: s.done, color: "mint" },
					{ value: s.inProgress, color: "sky" },
					{ value: s.overdue, color: "coral" },
				]}
				ringCenter={`${s.completionPct}%`}
				ringSub="done"
				tiles={[
					{ n: s.done, label: "Done", tone: "mint" },
					{ n: s.inProgress, label: "Active", tone: "sky" },
					{ n: s.overdue, label: "Overdue", tone: "coral" },
				]}
				nextUp={
					s.mostUrgent ? (
						<span className="text-text-secondary truncate">
							⏰ Up next —{" "}
							<b className="text-text-primary">{s.mostUrgent.plan_name || "Training"}</b> · due{" "}
							{fmtDate(s.mostUrgent.due_date)}
						</span>
					) : (
						<span className="text-text-tertiary">All caught up — nice work.</span>
					)
				}
			/>

			<div className="glass-surface rounded-2xl px-1.5 py-1">
				{items.length === 0 ? (
					<p className="text-small text-text-tertiary text-center py-8">
						No training assigned right now.
					</p>
				) : (
					<ul className="max-h-[340px] overflow-y-auto">
						{items.map((a) => (
							<AssignmentRow key={a.id} a={a} onComplete={complete} />
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
