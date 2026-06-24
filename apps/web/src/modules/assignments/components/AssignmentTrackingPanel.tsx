import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { AssignmentDetail } from "../api";

type Recipient = AssignmentDetail["recipients"][number];
type Filter = "all" | "completed" | "pending" | "overdue";

export function AssignmentTrackingPanel({
	detail,
	onRevise,
}: {
	detail: AssignmentDetail;
	onRevise?: () => void;
}) {
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");

	const { total, done, overdue } = detail.summary;
	const pendingCount = total - done;
	const pct = total ? Math.round((done / total) * 100) : 0;

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return detail.recipients.filter((r) => {
			if (filter === "completed" && r.status !== "completed") return false;
			if (filter === "pending" && r.effective_status !== "pending") return false;
			if (filter === "overdue" && r.effective_status !== "overdue") return false;
			if (!q) return true;
			return (
				(r.employee_name ?? "").toLowerCase().includes(q) ||
				(r.employee_code ?? "").toLowerCase().includes(q)
			);
		});
	}, [detail.recipients, filter, query]);

	const tabs: { key: Filter; label: string; n: number }[] = [
		{ key: "all", label: "All", n: total },
		{ key: "completed", label: "Done", n: done },
		{ key: "pending", label: "Pending", n: pendingCount },
		{ key: "overdue", label: "Overdue", n: overdue },
	];

	return (
		<div className="px-4 pb-4 pt-1 space-y-3">
			{/* progress */}
			<div className="space-y-1.5">
				<div className="flex items-end justify-between">
					<p className="text-h2 text-text-primary tabular-nums leading-none">{pct}%</p>
					<p className="text-[11px] text-text-tertiary">
						<b className="text-mint">{done}</b> done · {pendingCount} pending
						{overdue > 0 && <span className="text-coral"> · {overdue} overdue</span>}
						{detail.version && detail.version > 1 ? <span> · v{detail.version}</span> : null}
					</p>
				</div>
				<div className="h-1.5 rounded-full bg-surface/60 overflow-hidden">
					<div className="h-full bg-mint transition-all" style={{ width: `${pct}%` }} />
				</div>
			</div>

			{/* filter tabs */}
			<div className="flex flex-wrap gap-1.5">
				{tabs.map((t) => (
					<button
						key={t.key}
						type="button"
						onClick={() => setFilter(t.key)}
						className={cn(
							"text-[11px] px-2.5 py-1 rounded-lg transition-colors",
							filter === t.key
								? "bg-accent-500/15 text-accent-100 font-semibold"
								: "bg-surface-elevated/50 text-text-secondary hover:text-text-primary",
						)}
					>
						{t.label} {t.n}
					</button>
				))}
			</div>

			{/* search */}
			<div className="relative">
				<Search className="size-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
				<input
					aria-label="Search people"
					placeholder="Search people…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="w-full bg-canvas border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-small text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/40"
				/>
			</div>

			{/* scrollable recipient list */}
			{visible.length === 0 ? (
				<p className="text-small text-text-tertiary text-center py-6">No one matches.</p>
			) : (
				<ul className="max-h-[230px] overflow-y-auto -mx-1 px-1 space-y-0.5 assignment-scroll">
					{visible.map((r) => (
						<RecipientRow key={r.id} r={r} />
					))}
				</ul>
			)}

			{onRevise && detail.type === "acknowledge" && (
				<Button variant="outline" size="sm" className="w-full rounded-xl mt-1" onClick={onRevise}>
					Re-issue (new version)
				</Button>
			)}
		</div>
	);
}

function RecipientRow({ r }: { r: Recipient }) {
	const done = r.status === "completed";
	return (
		<li className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface/40">
			<span
				className={cn(
					"size-7 shrink-0 rounded-full grid place-items-center text-[10px] font-semibold uppercase",
					done ? "bg-mint/18 text-mint" : "bg-accent-500/15 text-accent-100",
				)}
			>
				{initials(r.employee_name)}
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-small text-text-primary truncate">
					{r.employee_name || "Unknown employee"}
				</p>
				<p className="text-[10px] text-text-tertiary truncate">
					{done && r.completed_at
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
	);
}

function initials(name?: string): string {
	if (!name) return "?";
	const p = name.trim().split(/\s+/);
	return (
		((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase() || "?"
	);
}
