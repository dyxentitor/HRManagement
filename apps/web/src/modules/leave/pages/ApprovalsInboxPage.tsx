import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { employeeApi } from "@/modules/employee/api";

import { type LeaveRequest, leaveApi } from "../api";
import { LeaveApprovalCard } from "../components/LeaveApprovalCard";

interface Clash {
	count: number;
	names: string[];
}

export default function ApprovalsInboxPage() {
	const [pending, setPending] = useState<LeaveRequest[]>([]);
	const [names, setNames] = useState<Map<string, string>>(new Map());
	const [clashes, setClashes] = useState<Map<string, Clash>>(new Map());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [bulkBusy, setBulkBusy] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const all = await leaveApi.listTeamRequests();
			const subs = all.filter((r) => r.status === "submitted");
			setPending(subs);
			setSelected(new Set());

			// Names (best-effort): map employee_id -> "First Last".
			try {
				const emps = (await employeeApi.list()) as Array<{
					id: string;
					first_name?: string;
					last_name?: string;
				}>;
				setNames(
					new Map(
						emps.map((e) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]),
					),
				);
			} catch {
				setNames(new Map());
			}

			// Coverage per request (clash awareness).
			const entries = await Promise.all(
				subs.map(async (r) => {
					try {
						const cov = await leaveApi.coverage(r.start_date, r.end_date, r.employee_id);
						const count = Object.values(cov.per_day ?? {}).reduce((a, b) => Math.max(a, b), 0);
						return [r.id, { count, names: cov.people.map((p) => p.name) }] as [string, Clash];
					} catch {
						return [r.id, { count: 0, names: [] as string[] }] as [string, Clash];
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

	async function approve(id: string, comment: string) {
		try {
			await leaveApi.approve(id, comment);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Approve failed");
		}
	}

	async function reject(id: string, comment: string) {
		if (!comment.trim()) {
			setError("A comment is required to reject.");
			return;
		}
		try {
			await leaveApi.reject(id, comment);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Reject failed");
		}
	}

	async function approveSelected() {
		setBulkBusy(true);
		try {
			for (const id of selected) {
				await leaveApi.approve(id, "");
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
		const subs = pending.filter((r) => r.submitted_at);
		if (subs.length === 0) return 0;
		const oldest = subs.reduce((min, r) =>
			(r.submitted_at ?? "") < (min.submitted_at ?? "") ? r : min,
		);
		if (!oldest.submitted_at) return 0;
		return Math.round((Date.now() - new Date(oldest.submitted_at).getTime()) / 86_400_000);
	}, [pending]);

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
					pending.length
						? `${pending.length} pending · oldest waiting ${oldestDays} day${oldestDays === 1 ? "" : "s"}`
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
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{pending.length === 0 ? (
				<div className="bg-surface-hover border border-dashed border-border-subtle rounded-xl p-8 text-center text-text-tertiary">
					No pending approvals. You're all caught up. 🎉
				</div>
			) : (
				<div className="space-y-3">
					{pending.map((r, i) => (
						<LeaveApprovalCard
							key={r.id}
							request={r}
							name={names.get(r.employee_id) || r.employee_id.slice(0, 8)}
							clash={clashes.get(r.id)}
							selected={selected.has(r.id)}
							onToggleSelect={() => toggle(r.id)}
							onApprove={(c) => approve(r.id, c)}
							onReject={(c) => reject(r.id, c)}
							tone={i}
						/>
					))}
				</div>
			)}
		</div>
	);
}
