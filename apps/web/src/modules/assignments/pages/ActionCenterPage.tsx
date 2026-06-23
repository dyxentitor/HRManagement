import { CheckCircle2, ExternalLink, GraduationCap, ListChecks, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { type TrainingAssignment, certificationApi } from "@/modules/certification/api";
import { type RecipientRow, assignmentsApi } from "../api";

type Bucket = "Overdue" | "Due soon" | "Upcoming" | "Completed";

function bucketOf(r: RecipientRow): Bucket {
	if (r.status === "completed") return "Completed";
	if (r.effective_status === "overdue") return "Overdue";
	if (r.due_date) {
		const days = (new Date(`${r.due_date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000;
		if (days <= 7) return "Due soon";
	}
	return "Upcoming";
}

const ORDER: Bucket[] = ["Overdue", "Due soon", "Upcoming", "Completed"];

export default function ActionCenterPage() {
	const [rows, setRows] = useState<RecipientRow[] | null>(null);
	const [training, setTraining] = useState<TrainingAssignment[]>([]);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setRows(await assignmentsApi.myAssignments());
		} catch {
			setRows([]);
		}
		// read-only aggregation of existing training assignments (graceful if module off)
		try {
			const t = await certificationApi.myAssignments();
			setTraining(t.filter((a) => a.status !== "completed"));
		} catch {
			setTraining([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function complete(r: RecipientRow) {
		setBusy(r.id);
		try {
			await assignmentsApi.complete(r.assignment.id, "");
			toast.success(r.assignment.type === "acknowledge" ? "Acknowledged" : "Marked complete");
			setRows((prev) =>
				(prev ?? []).map((x) =>
					x.id === r.id ? { ...x, status: "completed", effective_status: "completed" } : x,
				),
			);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not complete");
		} finally {
			setBusy(null);
		}
	}

	if (rows === null) return <Skeleton className="h-64 rounded-2xl" />;

	const groups = new Map<Bucket, RecipientRow[]>();
	for (const r of rows) {
		const b = bucketOf(r);
		groups.set(b, [...(groups.get(b) ?? []), r]);
	}
	const open = rows.filter((r) => r.status !== "completed").length;

	return (
		<div className="space-y-5">
			<PageHeader
				breadcrumb="Action Center"
				title="Action Center"
				subtitle={`${open} open action${open === 1 ? "" : "s"}`}
			/>

			{rows.length === 0 ? (
				<p className="text-small text-text-tertiary glass-surface rounded-2xl p-10 text-center">
					Nothing assigned to you right now — you're all caught up. 🎉
				</p>
			) : (
				ORDER.filter((b) => groups.has(b)).map((bucket) => (
					<section key={bucket} className="space-y-2">
						<p className="layer-eyebrow">{bucket}</p>
						<ul className="space-y-2">
							{(groups.get(bucket) ?? []).map((r) => (
								<li
									key={r.id}
									className="glass-surface rounded-xl px-4 py-3 flex items-center gap-3"
								>
									{r.assignment.type === "acknowledge" ? (
										<ShieldCheck className="size-5 text-lavender shrink-0" aria-hidden />
									) : (
										<ListChecks className="size-5 text-sky shrink-0" aria-hidden />
									)}
									<div className="min-w-0 flex-1">
										<p className="text-body text-text-primary truncate">{r.assignment.title}</p>
										<p className="text-[11px] text-text-tertiary truncate">
											{r.assignment.description ||
												(r.due_date ? `Due ${r.due_date}` : "No due date")}
										</p>
									</div>
									{r.effective_status === "overdue" && <StatusPill tone="coral" label="overdue" />}
									{r.status === "completed" ? (
										<span className="inline-flex items-center gap-1.5 text-small text-mint">
											<CheckCircle2 className="size-4" /> Done
										</span>
									) : (
										<>
											{r.assignment.link_url &&
												(r.assignment.link_target === "internal" ? (
													<Button asChild variant="outline" size="sm">
														<Link to={r.assignment.link_url}>Open</Link>
													</Button>
												) : (
													<Button asChild variant="outline" size="sm">
														<a
															href={r.assignment.link_url}
															target="_blank"
															rel="noopener noreferrer"
														>
															Open <ExternalLink className="size-3.5 ml-1" />
														</a>
													</Button>
												))}
											<Button
												size="sm"
												className="soft-glow rounded-xl shrink-0"
												disabled={busy === r.id}
												onClick={() => complete(r)}
											>
												{r.assignment.type === "acknowledge" ? "Acknowledge" : "Mark complete"}
											</Button>
										</>
									)}
								</li>
							))}
						</ul>
					</section>
				))
			)}

			{training.length > 0 && (
				<section className="space-y-2">
					<p className="layer-eyebrow">Training</p>
					<ul className="space-y-2">
						{training.map((t) => (
							<li key={t.id} className="glass-surface rounded-xl px-4 py-3 flex items-center gap-3">
								<GraduationCap className="size-5 text-peach shrink-0" aria-hidden />
								<div className="min-w-0 flex-1">
									<p className="text-body text-text-primary truncate">{t.plan_name}</p>
									<p className="text-[11px] text-text-tertiary">
										{t.due_date ? `Due ${t.due_date}` : "Training"} · complete in Growth
									</p>
								</div>
								<Button asChild variant="outline" size="sm">
									<Link to="/growth">Open</Link>
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
