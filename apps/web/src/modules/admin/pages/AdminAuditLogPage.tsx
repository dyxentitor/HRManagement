import { Download, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/lib/perm";
import {
	type AuditFilters,
	type AuditRow,
	downloadAuditCsv,
	listAuditLogs,
} from "../audit-api";

const PAGE_SIZE = 50;
const ALL = "__all__";

function fmtTime(iso: string): string {
	return new Date(iso).toLocaleString("en-MY", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function humanizeAction(action: string): string {
	// keep full context (e.g. "salary.update" → "salary update")
	return action.replace(/\./g, " ").replace(/_/g, " ");
}

export default function AdminAuditLogPage() {
	const canRead = useCan("audit:read:org");
	const [rows, setRows] = useState<AuditRow[]>([]);
	const [entities, setEntities] = useState<string[]>([]);
	const [count, setCount] = useState(0);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [detail, setDetail] = useState<AuditRow | null>(null);

	// Filter inputs (draft) vs applied filters.
	const [entity, setEntity] = useState<string>(ALL);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [q, setQ] = useState("");

	const filters: AuditFilters = useMemo(
		() => ({
			page,
			page_size: PAGE_SIZE,
			entity: entity === ALL ? undefined : entity,
			date_from: dateFrom || undefined,
			date_to: dateTo || undefined,
			q: q || undefined,
		}),
		[page, entity, dateFrom, dateTo, q],
	);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const data = await listAuditLogs(filters);
			setRows(data.results);
			setCount(data.count);
			if (data.entities.length) setEntities(data.entities);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not load audit log");
		} finally {
			setLoading(false);
		}
	}, [filters]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function exportCsv() {
		try {
			await downloadAuditCsv(filters);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Export failed");
		}
	}

	if (!canRead) {
		return (
			<div className="space-y-4">
				<PageHeader title="Audit Log" />
				<p className="text-text-tertiary">
					You don't have permission to view the audit log.
				</p>
			</div>
		);
	}

	const from = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
	const to = Math.min(page * PAGE_SIZE, count);
	const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));

	return (
		<div className="space-y-4">
			<PageHeader
				title="Audit Log"
				subtitle={`${count} recorded events · who changed what, and when`}
				actions={
					<Button type="button" variant="ghost" onClick={exportCsv}>
						<Download className="size-4 mr-1" /> Export CSV
					</Button>
				}
			/>

			{/* Filters */}
			<div className="flex flex-wrap items-end gap-2 bg-surface-hover border border-border-subtle rounded-lg p-3">
				<div>
					<span className="text-label text-text-tertiary block mb-1">Entity</span>
					<Select
						value={entity}
						onValueChange={(v) => {
							setPage(1);
							setEntity(v);
						}}
					>
						<SelectTrigger className="w-40">
							<SelectValue placeholder="All" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>All entities</SelectItem>
							{entities.map((e) => (
								<SelectItem key={e} value={e}>
									{e}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<label className="block">
					<span className="text-label text-text-tertiary block mb-1">From</span>
					<Input
						type="date"
						value={dateFrom}
						onChange={(e) => {
							setPage(1);
							setDateFrom(e.target.value);
						}}
						className="w-36"
					/>
				</label>
				<label className="block">
					<span className="text-label text-text-tertiary block mb-1">To</span>
					<Input
						type="date"
						value={dateTo}
						onChange={(e) => {
							setPage(1);
							setDateTo(e.target.value);
						}}
						className="w-36"
					/>
				</label>
				<label className="block flex-1 min-w-[180px]">
					<span className="text-label text-text-tertiary block mb-1">Search</span>
					<div className="relative">
						<Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
						<Input
							value={q}
							onChange={(e) => {
								setPage(1);
								setQ(e.target.value);
							}}
							placeholder="action or entity…"
							className="pl-8"
						/>
					</div>
				</label>
			</div>

			{loading ? (
				<p className="text-text-tertiary">Loading…</p>
			) : (
				<DataTable
					rows={rows}
					rowKey={(r) => String(r.id)}
					onRowClick={(r) => setDetail(r)}
					emptyState={
						<div className="bg-surface-hover border border-dashed border-border-subtle rounded-lg p-8 text-center text-text-tertiary">
							No audit events match these filters.
						</div>
					}
					columns={[
						{
							key: "ts",
							header: "When",
							render: (r) => <span className="text-text-secondary">{fmtTime(r.ts)}</span>,
							width: "190px",
						},
						{ key: "actor", header: "Who", render: (r) => r.actor },
						{
							key: "action",
							header: "Action",
							render: (r) => (
								<span className="text-text-primary">{humanizeAction(r.action)}</span>
							),
						},
						{
							key: "entity",
							header: "Entity",
							render: (r) => <span className="text-text-tertiary">{r.entity}</span>,
						},
						{
							key: "detail",
							header: "",
							align: "right",
							render: (r) =>
								r.before || r.after ? (
									<span className="text-small text-accent-200">View changes →</span>
								) : null,
						},
					]}
				/>
			)}

			{/* Pagination */}
			{count > PAGE_SIZE && (
				<div className="flex items-center justify-between text-small text-text-tertiary">
					<span>
						{from}–{to} of {count}
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

			{detail && <DetailDialog row={detail} onClose={() => setDetail(null)} />}
		</div>
	);
}

function DetailDialog({ row, onClose }: { row: AuditRow; onClose: () => void }) {
	const before = row.before ?? {};
	const after = row.after ?? {};
	const keys = Array.from(
		new Set([...Object.keys(before), ...Object.keys(after)]),
	).sort();
	const show = (v: unknown) =>
		v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{humanizeAction(row.action)} · {row.entity}
					</DialogTitle>
				</DialogHeader>
				<p className="text-small text-text-tertiary">
					{row.actor} · {fmtTime(row.ts)}
					{row.ip ? ` · ${row.ip}` : ""}
				</p>
				{keys.length === 0 ? (
					<p className="text-small text-text-secondary">
						No field-level changes were recorded for this event.
					</p>
				) : (
					<div className="border border-border-subtle rounded-lg overflow-hidden">
						<div className="grid grid-cols-[1fr_1fr_1fr] text-label text-text-tertiary bg-surface-hover px-3 py-2">
							<span>Field</span>
							<span>Before</span>
							<span>After</span>
						</div>
						<ul className="divide-y divide-border-subtle">
							{keys.map((k) => {
								const changed =
									JSON.stringify(before[k as keyof typeof before]) !==
									JSON.stringify(after[k as keyof typeof after]);
								return (
									<li
										key={k}
										className="grid grid-cols-[1fr_1fr_1fr] px-3 py-2 text-small items-center"
									>
										<span className="text-text-secondary">{k}</span>
										<span className={changed ? "text-coral" : "text-text-tertiary"}>
											{show(before[k as keyof typeof before])}
										</span>
										<span className={changed ? "text-mint" : "text-text-tertiary"}>
											{show(after[k as keyof typeof after])}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
