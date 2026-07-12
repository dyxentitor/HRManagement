import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DataTable, DetailPanel, StatusPill } from "@/components/hrms";
import type { Column } from "@/components/hrms/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/perm";

import {
	type AdminUser,
	type FeedbackItem,
	type FeedbackNote,
	type FeedbackStatus,
	feedbackApi,
} from "../api";
import {
	CATEGORIES,
	CATEGORY_LABELS,
	STATUS_LABELS,
	STATUS_TONE,
	fmtDate,
} from "../lib/feedback-ui";

const STATUSES: { value: FeedbackStatus; label: string }[] = [
	{ value: "new", label: "New" },
	{ value: "in_review", label: "In Review" },
	{ value: "resolved", label: "Resolved" },
	{ value: "closed", label: "Closed" },
];

export default function FeedbackAdminPage() {
	const canManage = useCan("feedback:manage:org");

	const [items, setItems] = useState<FeedbackItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [admins, setAdmins] = useState<AdminUser[]>([]);

	// Filters — "__all__" is the sentinel for "no filter" (Radix SelectItem rejects "")
	const [statusFilter, setStatusFilter] = useState("__all__");
	const [categoryFilter, setCategoryFilter] = useState("__all__");
	const [query, setQuery] = useState("");
	const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [debouncedQuery, setDebouncedQuery] = useState("");

	// Detail panel
	const [selected, setSelected] = useState<FeedbackItem | null>(null);
	const [notes, setNotes] = useState<FeedbackNote[]>([]);
	const [noteBody, setNoteBody] = useState("");
	const [addingNote, setAddingNote] = useState(false);
	const [updatingStatus, setUpdatingStatus] = useState(false);
	const [assigning, setAssigning] = useState(false);

	const refresh = useCallback(async () => {
		if (!canManage) return;
		setLoading(true);
		try {
			const list = await feedbackApi.listAll({
				...(statusFilter && statusFilter !== "__all__" ? { status: statusFilter } : {}),
				...(categoryFilter && categoryFilter !== "__all__" ? { category: categoryFilter } : {}),
				...(debouncedQuery ? { q: debouncedQuery } : {}),
			});
			setItems(list);
		} catch {
			// silent — table stays empty
		} finally {
			setLoading(false);
		}
	}, [canManage, statusFilter, categoryFilter, debouncedQuery]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Load admins for assignee select (once, only when permitted)
	useEffect(() => {
		if (!canManage) return;
		feedbackApi
			.listAdmins()
			.then(setAdmins)
			.catch(() => setAdmins([]));
	}, [canManage]);

	// Debounce query input
	function onQueryChange(value: string) {
		setQuery(value);
		if (searchTimeout.current) clearTimeout(searchTimeout.current);
		searchTimeout.current = setTimeout(() => {
			setDebouncedQuery(value);
		}, 350);
	}

	async function openDetail(item: FeedbackItem) {
		setSelected(item);
		setNoteBody("");
		// Load notes from the API (detail may already include them, but fetch fresh)
		try {
			const n = await feedbackApi.listNotes(item.id);
			setNotes(n);
		} catch {
			// Use notes from the item if available
			setNotes(item.notes ?? []);
		}
	}

	async function handleStatusChange(newStatus: string) {
		if (!selected) return;
		setUpdatingStatus(true);
		try {
			const updated = await feedbackApi.updateStatus(selected.id, newStatus as FeedbackStatus);
			setSelected(updated);
			setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
			toast.success("Status updated");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to update status");
		} finally {
			setUpdatingStatus(false);
		}
	}

	async function handleAssigneeChange(assigneeId: string) {
		if (!selected) return;
		setAssigning(true);
		try {
			const newId = assigneeId === "__none__" ? null : assigneeId;
			const updated = await feedbackApi.assign(selected.id, newId);
			setSelected(updated);
			setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
			toast.success("Assignee updated");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to update assignee");
		} finally {
			setAssigning(false);
		}
	}

	async function handleAddNote() {
		if (!selected || !noteBody.trim()) return;
		setAddingNote(true);
		try {
			const note = await feedbackApi.addNote(selected.id, noteBody.trim());
			setNotes((prev) => [...prev, note]);
			setNoteBody("");
			toast.success("Note added");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to add note");
		} finally {
			setAddingNote(false);
		}
	}

	async function openDownload(feedbackId: string, attId: number) {
		try {
			const result = await feedbackApi.downloadAttachment(feedbackId, attId);
			window.open(result.url, "_blank", "noopener,noreferrer");
		} catch {
			toast.error("Failed to download attachment");
		}
	}

	const columns: Column<FeedbackItem>[] = [
		{
			key: "category",
			header: "Category",
			render: (row) => (
				<span className="text-text-secondary">
					{CATEGORY_LABELS[row.category] ?? row.category}
				</span>
			),
			sortable: true,
			sortValue: (row) => row.category,
		},
		{
			key: "title",
			header: "Title",
			render: (row) => (
				<span className="text-text-primary font-medium">{row.title}</span>
			),
			sortable: true,
			sortValue: (row) => row.title,
		},
		{
			key: "reporter_email",
			header: "Submitted by",
			render: (row) => (
				<span className="text-text-secondary text-small">
					{row.reporter_email ?? "—"}
				</span>
			),
		},
		{
			key: "created_at",
			header: "Date",
			render: (row) => (
				<span className="text-text-tertiary tabular-nums">{fmtDate(row.created_at)}</span>
			),
			sortable: true,
			sortValue: (row) => row.created_at,
		},
		{
			key: "status",
			header: "Status",
			render: (row) => (
				<StatusPill
					tone={STATUS_TONE[row.status]}
					label={STATUS_LABELS[row.status] ?? row.status}
				/>
			),
		},
	];

	if (!canManage) {
		return (
			<div className="space-y-6">
				<PageHeader
					title="Feedback Management"
					subtitle="Admin view of all submitted feedback."
				/>
				<div className="glass-surface rounded-2xl p-8 text-center">
					<MessageSquare className="size-8 text-text-tertiary mx-auto mb-3" aria-hidden />
					<p className="text-text-secondary">
						You don't have permission to manage feedback.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Feedback Management"
				subtitle="Review, triage and close feedback submitted by your team."
			/>

			{/* Filter bar */}
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="Search feedback…"
					aria-label="Search feedback"
					className="h-8 min-w-[200px] flex-1 max-w-xs"
				/>

				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className="h-8 w-[160px]" aria-label="Filter by status">
						<SelectValue placeholder="All statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">All statuses</SelectItem>
						{STATUSES.map((s) => (
							<SelectItem key={s.value} value={s.value}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select value={categoryFilter} onValueChange={setCategoryFilter}>
					<SelectTrigger className="h-8 w-[170px]" aria-label="Filter by category">
						<SelectValue placeholder="All categories" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">All categories</SelectItem>
						{CATEGORIES.map((c) => (
							<SelectItem key={c.value} value={c.value}>
								{c.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Table */}
			<div className="glass-surface rounded-2xl p-4">
				{loading ? (
					<div className="space-y-2">
						{["a", "b", "c"].map((k) => (
							<div
								key={k}
								className="h-10 rounded bg-surface-hover animate-pulse"
							/>
						))}
					</div>
				) : (
					<DataTable
						rows={items}
						columns={columns}
						rowKey={(r) => r.id}
						onRowClick={openDetail}
						emptyState={
							<p className="text-body text-text-tertiary py-4 text-center">
								No feedback found.
							</p>
						}
					/>
				)}
			</div>

			{/* Detail panel */}
			<DetailPanel
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? selected.title : "Feedback"}
			>
				{selected && (
					<div className="space-y-5">
						{/* Meta */}
						<dl className="grid grid-cols-[110px_1fr] gap-y-2 text-body">
							<dt className="text-label uppercase text-text-tertiary self-center">Category</dt>
							<dd>{CATEGORY_LABELS[selected.category] ?? selected.category}</dd>

							<dt className="text-label uppercase text-text-tertiary self-center">Submitted</dt>
							<dd className="tabular-nums">{fmtDate(selected.created_at)}</dd>

							<dt className="text-label uppercase text-text-tertiary self-center">Reporter</dt>
							<dd className="text-small text-text-secondary">{selected.reporter_email ?? "—"}</dd>

							{selected.affected_module && (
								<>
									<dt className="text-label uppercase text-text-tertiary self-center">Module</dt>
									<dd>{selected.affected_module}</dd>
								</>
							)}

							<dt className="text-label uppercase text-text-tertiary self-start pt-1">Description</dt>
							<dd className="whitespace-pre-wrap text-small">{selected.description}</dd>
						</dl>

						{/* Attachments */}
						{selected.attachments && selected.attachments.length > 0 && (
							<div>
								<p className="text-label uppercase text-text-tertiary mb-1.5">Attachments</p>
								<ul className="space-y-1">
									{selected.attachments.map((att) => (
										<li key={att.id}>
											<button
												type="button"
												className="text-accent-200 hover:text-accent-100 text-small truncate text-left"
												onClick={() => void openDownload(selected.id, att.id)}
											>
												{att.filename}
											</button>
										</li>
									))}
								</ul>
							</div>
						)}

						{/* Status */}
						<div>
							<label
								htmlFor="detail-status"
								className="text-label uppercase text-text-tertiary block mb-1.5"
							>
								Status
							</label>
							<Select
								value={selected.status}
								onValueChange={handleStatusChange}
								disabled={updatingStatus}
							>
								<SelectTrigger id="detail-status" aria-label="Status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUSES.map((s) => (
										<SelectItem key={s.value} value={s.value}>
											{s.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Assignee */}
						<div>
							<label
								htmlFor="detail-assignee"
								className="text-label uppercase text-text-tertiary block mb-1.5"
							>
								Assignee
							</label>
							<Select
								value={selected.assignee_id ?? "__none__"}
								onValueChange={handleAssigneeChange}
								disabled={assigning}
							>
								<SelectTrigger id="detail-assignee" aria-label="Assignee">
									<SelectValue placeholder="Unassigned" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">Unassigned</SelectItem>
									{admins.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.email}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Notes */}
						<div>
							<p className="text-label uppercase text-text-tertiary mb-2">
								Internal notes
							</p>
							{notes.length > 0 ? (
								<ul className="space-y-2 mb-3">
									{notes.map((n) => (
										<li
											key={n.id}
											className="bg-surface-elevated/60 rounded-lg px-3 py-2 text-small"
										>
											<p className="text-text-primary whitespace-pre-wrap">{n.body}</p>
											<p className="text-text-tertiary mt-1">
												{n.author_name} · {fmtDate(n.created_at)}
											</p>
										</li>
									))}
								</ul>
							) : (
								<p className="text-small text-text-tertiary mb-3">No notes yet.</p>
							)}

							<Textarea
								value={noteBody}
								onChange={(e) => setNoteBody(e.target.value)}
								rows={3}
								placeholder="Add an internal note…"
								aria-label="Internal note"
								className="mb-2"
							/>
							<Button
								type="button"
								onClick={() => void handleAddNote()}
								disabled={!noteBody.trim() || addingNote}
								className="w-full"
							>
								{addingNote ? "Adding…" : "Add note"}
							</Button>
						</div>
					</div>
				)}
			</DetailPanel>
		</div>
	);
}
