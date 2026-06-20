import { useMemo, useState } from "react";

import { type Column, DataTable, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "../api";
import { formatRange, utcDate } from "../lib/leave-dates";
import { STATUS_TONE, typeTone } from "../lib/leave-ui";

const PAGE_SIZE = 10;
const FILTERS: { key: string; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "approved", label: "Approved" },
	{ key: "submitted", label: "Pending" },
	{ key: "rejected", label: "Rejected" },
];

function halfDayLabel(r: LeaveRequest): string | null {
	if (!r.is_half_day) return null;
	return r.half_day_period === "pm" ? "½ PM" : "½ AM";
}

export interface LeaveHistoryProps {
	requests: LeaveRequest[];
	onSelect: (r: LeaveRequest) => void;
}

export function LeaveHistory({ requests, onSelect }: LeaveHistoryProps) {
	const [filter, setFilter] = useState("all");
	const [page, setPage] = useState(1);

	const filtered = useMemo(() => {
		const rows = filter === "all" ? requests : requests.filter((r) => r.status === filter);
		return [...rows].sort((a, b) => b.start_date.localeCompare(a.start_date));
	}, [requests, filter]);

	const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
	const lastPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

	const columns: Column<LeaveRequest>[] = [
		{
			key: "type",
			header: "Type",
			render: (r) => <StatusPill tone={typeTone(r.leave_type_code)} label={r.leave_type_code} />,
		},
		{
			key: "dates",
			header: "Dates",
			render: (r) => {
				const half = halfDayLabel(r);
				return (
					<span>
						{formatRange(r.start_date, r.end_date)}
						{half && <span className="text-text-tertiary"> · {half}</span>}
					</span>
				);
			},
		},
		{
			key: "days",
			header: "Days",
			align: "right",
			render: (r) => <span className="tabular-nums">{r.total_days}</span>,
		},
		{
			key: "reason",
			header: "Reason",
			render: (r) => (
				<span className="block max-w-[180px] truncate text-text-tertiary" title={r.reason}>
					{r.reason || "—"}
				</span>
			),
		},
		{
			key: "status",
			header: "Status",
			render: (r) => <StatusPill tone={STATUS_TONE[r.status]} label={r.status} />,
		},
		{
			key: "decided",
			header: "Decided",
			render: (r) =>
				r.decided_at ? (
					<span className="text-text-tertiary">
						{utcDate(r.decided_at.slice(0, 10)).toLocaleDateString("en-MY", {
							day: "numeric",
							month: "short",
							timeZone: "UTC",
						})}
					</span>
				) : (
					<span className="text-text-tertiary">—</span>
				),
		},
	];

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-2">
				{FILTERS.map((f) => (
					<button
						key={f.key}
						type="button"
						onClick={() => {
							setFilter(f.key);
							setPage(1);
						}}
						className={cn(
							"text-small px-3 py-1 rounded-full border",
							filter === f.key
								? "border-accent-500 bg-accent-500/15 text-text-primary"
								: "border-border-subtle text-text-tertiary hover:text-text-secondary",
						)}
					>
						{f.label}
					</button>
				))}
			</div>

			<DataTable<LeaveRequest>
				rows={pageRows}
				columns={columns}
				rowKey={(r) => r.id}
				onRowClick={onSelect}
				emptyState={
					<div className="text-text-tertiary text-small p-6 text-center">
						No leave requests match this filter.
					</div>
				}
			/>

			{filtered.length > PAGE_SIZE && (
				<div className="flex items-center justify-between text-small text-text-tertiary">
					<span>
						Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
						{filtered.length}
					</span>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={page <= 1}
							onClick={() => setPage((p) => p - 1)}
						>
							Previous
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={page >= lastPage}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
