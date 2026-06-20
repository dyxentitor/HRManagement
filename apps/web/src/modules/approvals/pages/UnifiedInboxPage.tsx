import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { leaveApi } from "@/modules/leave/api";

import { type InboxItem, approveItem, getInbox, rejectItem } from "../api";
import { type Clash, UnifiedApprovalCard } from "../components/UnifiedApprovalCard";

type Filter = "all" | InboxItem["kind"];

export default function UnifiedInboxPage() {
	const [items, setItems] = useState<InboxItem[]>([]);
	const [clashes, setClashes] = useState<Map<string, Clash>>(new Map());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [bulkBusy, setBulkBusy] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getInbox();
			setItems(data);
			setSelected(new Set());

			// Team coverage for leave items only (claims/KPI have no calendar clash).
			const leaves = data.filter((i) => i.kind === "leave");
			const entries = await Promise.all(
				leaves.map(async (i) => {
					try {
						const start = String(i.detail.start_date ?? "");
						const end = String(i.detail.end_date ?? "");
						const cov = await leaveApi.coverage(start, end, i.employee_id);
						const count = Object.values(cov.per_day ?? {}).reduce(
							(a, b) => Math.max(a, b),
							0,
						);
						return [i.id, { count, names: cov.people.map((p) => p.name) }] as [string, Clash];
					} catch {
						return [i.id, { count: 0, names: [] as string[] }] as [string, Clash];
					}
				}),
			);
			setClashes(new Map(entries));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const counts = useMemo(
		() => ({
			all: items.length,
			leave: items.filter((i) => i.kind === "leave").length,
			claim: items.filter((i) => i.kind === "claim").length,
			kpi: items.filter((i) => i.kind === "kpi").length,
		}),
		[items],
	);

	const filtered = useMemo(
		() => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
		[items, filter],
	);

	async function approve(item: InboxItem, comment: string) {
		try {
			await approveItem(item.kind, item.id, comment);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Approve failed");
		}
	}

	async function reject(item: InboxItem, comment: string) {
		if (!comment.trim()) {
			setError("A comment is required to reject.");
			return;
		}
		try {
			await rejectItem(item.kind, item.id, comment);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Reject failed");
		}
	}

	async function approveSelected() {
		setBulkBusy(true);
		try {
			for (const id of selected) {
				const item = items.find((i) => i.id === id);
				if (item) await approveItem(item.kind, item.id, "");
			}
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Bulk approve failed");
		} finally {
			setBulkBusy(false);
		}
	}

	function toggle(id: string) {
		setSelected((s) => {
			const next = new Set(s);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	const oldestDays = useMemo(() => {
		const subs = items.filter((i) => i.submitted_at);
		if (subs.length === 0) return 0;
		const oldest = subs.reduce((m, i) =>
			(i.submitted_at ?? "") < (m.submitted_at ?? "") ? i : m,
		);
		if (!oldest.submitted_at) return 0;
		return Math.round((Date.now() - new Date(oldest.submitted_at).getTime()) / 86_400_000);
	}, [items]);

	function filterPill(key: Filter, label: string) {
		return (
			<button
				key={key}
				type="button"
				onClick={() => setFilter(key)}
				className={cn(
					"px-3 py-1 rounded-full text-small font-semibold transition-colors duration-fast border",
					filter === key
						? "border-accent-500 bg-accent-500/15 text-text-primary"
						: "border-border-subtle text-text-tertiary hover:text-text-secondary",
				)}
			>
				{label} · {counts[key]}
			</button>
		);
	}

	if (loading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-9 w-64 rounded-lg" />
				{["a", "b", "c"].map((k) => (
					<Skeleton key={k} className="h-28 rounded-xl" />
				))}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title="Approvals"
				subtitle={
					counts.all
						? `${counts.all} pending · oldest waiting ${oldestDays} day${oldestDays === 1 ? "" : "s"}`
						: "Nothing waiting on you"
				}
				actions={
					selected.size > 0 ? (
						<Button type="button" disabled={bulkBusy} onClick={approveSelected}>
							✓ Approve selected ({selected.size})
						</Button>
					) : null
				}
			/>

			{error && (
				<p className="text-coral text-small" role="alert">
					{error}
				</p>
			)}

			<div className="flex flex-wrap gap-2">
				{filterPill("all", "All")}
				{filterPill("leave", "Leave")}
				{filterPill("claim", "Claims")}
				{filterPill("kpi", "KPI")}
			</div>

			{filtered.length === 0 ? (
				<div className="bg-surface-hover border border-dashed border-border-subtle rounded-xl p-8 text-center text-text-tertiary">
					All caught up. No pending {filter === "all" ? "approvals" : filter}. 🎉
				</div>
			) : (
				<div className="space-y-3">
					{filtered.map((item, i) => (
						<UnifiedApprovalCard
							key={`${item.kind}-${item.id}`}
							item={item}
							clash={clashes.get(item.id)}
							selected={selected.has(item.id)}
							onToggleSelect={() => toggle(item.id)}
							onApprove={(c) => approve(item, c)}
							onReject={(c) => reject(item, c)}
							tone={i}
						/>
					))}
				</div>
			)}
		</div>
	);
}
