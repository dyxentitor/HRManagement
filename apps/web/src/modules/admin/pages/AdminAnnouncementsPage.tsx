import { Pin, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DataTable, StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/perm";
import {
	type Announcement,
	type AnnouncementCategory,
	type AnnouncementWritePayload,
	announcementApi,
} from "../announcements-api";

const CATEGORIES: { value: AnnouncementCategory; label: string }[] = [
	{ value: "policy", label: "Policy" },
	{ value: "event", label: "Event" },
	{ value: "maintenance", label: "Maintenance" },
	{ value: "holiday", label: "Holiday" },
	{ value: "general", label: "General" },
];

const CAT_TONE: Record<
	AnnouncementCategory,
	"lavender" | "sky" | "yellow" | "mint" | "peach"
> = {
	policy: "lavender",
	event: "sky",
	maintenance: "yellow",
	holiday: "mint",
	general: "peach",
};

type Modal =
	| { kind: "closed" }
	| { kind: "create" }
	| { kind: "edit"; row: Announcement }
	| { kind: "delete"; row: Announcement };

export default function AdminAnnouncementsPage() {
	const canWrite = useCan("announcement:write");
	const [rows, setRows] = useState<Announcement[]>([]);
	const [loading, setLoading] = useState(true);
	const [modal, setModal] = useState<Modal>({ kind: "closed" });

	const refresh = useCallback(async () => {
		try {
			setRows(await announcementApi.list());
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not load announcements");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function togglePin(row: Announcement) {
		try {
			await announcementApi.update(row.id, { pinned: !row.pinned });
			toast.success(row.pinned ? "Unpinned" : "Pinned — now featured on the dashboard");
			await refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not update");
		}
	}

	if (!canWrite) {
		return (
			<div className="space-y-4">
				<PageHeader title="Announcements" />
				<p className="text-text-tertiary">
					You don't have permission to manage announcements.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title="Announcements"
				subtitle={`${rows.length} published · the first pinned one is featured on the dashboard hero`}
				actions={
					<Button type="button" onClick={() => setModal({ kind: "create" })}>
						<Plus className="size-4 mr-1" /> New announcement
					</Button>
				}
			/>

			{loading ? (
				<p className="text-text-tertiary">Loading…</p>
			) : (
				<DataTable
					rows={rows}
					rowKey={(r) => r.id}
					emptyState={
						<div className="bg-surface-hover border border-dashed border-border-subtle rounded-lg p-8 text-center text-text-tertiary">
							No announcements yet. Create one to feature it on the dashboard.
						</div>
					}
					columns={[
						{
							key: "title",
							header: "Title",
							render: (r) => (
								<div className="flex items-center gap-2 min-w-0">
									{r.pinned && (
										<Pin className="size-3.5 text-yellow shrink-0" aria-label="Pinned" />
									)}
									<span className="text-text-primary truncate">{r.title}</span>
								</div>
							),
						},
						{
							key: "category",
							header: "Category",
							render: (r) => <StatusPill tone={CAT_TONE[r.category]} label={r.category} />,
						},
						{
							key: "published",
							header: "Published",
							render: (r) => new Date(r.published_at).toLocaleDateString("en-MY"),
							sortable: true,
							sortValue: (r) => r.published_at,
						},
						{
							key: "actions",
							header: "",
							align: "right",
							render: (r) => (
								<div className="flex justify-end gap-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => togglePin(r)}
									>
										{r.pinned ? "Unpin" : "Pin"}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setModal({ kind: "edit", row: r })}
									>
										Edit
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="text-coral"
										onClick={() => setModal({ kind: "delete", row: r })}
									>
										Delete
									</Button>
								</div>
							),
						},
					]}
				/>
			)}

			{(modal.kind === "create" || modal.kind === "edit") && (
				<AnnouncementModal
					row={modal.kind === "edit" ? modal.row : null}
					onClose={() => setModal({ kind: "closed" })}
					onSaved={async () => {
						setModal({ kind: "closed" });
						await refresh();
					}}
				/>
			)}

			{modal.kind === "delete" && (
				<DeleteDialog
					row={modal.row}
					onClose={() => setModal({ kind: "closed" })}
					onDeleted={async () => {
						setModal({ kind: "closed" });
						await refresh();
					}}
				/>
			)}
		</div>
	);
}

function AnnouncementModal({
	row,
	onClose,
	onSaved,
}: {
	row: Announcement | null;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const [title, setTitle] = useState(row?.title ?? "");
	const [body, setBody] = useState(row?.body ?? "");
	const [category, setCategory] = useState<AnnouncementCategory>(
		row?.category ?? "general",
	);
	const [pinned, setPinned] = useState(row?.pinned ?? false);
	const [expiresAt, setExpiresAt] = useState(row?.expires_at?.slice(0, 10) ?? "");
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			const payload: AnnouncementWritePayload = {
				title: title.trim(),
				body: body.trim(),
				category,
				pinned,
				expires_at: expiresAt ? new Date(`${expiresAt}T00:00:00Z`).toISOString() : null,
			};
			if (row) {
				await announcementApi.update(row.id, payload);
				toast.success("Announcement updated");
			} else {
				await announcementApi.create(payload);
				toast.success("Announcement published");
			}
			await onSaved();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not save");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{row ? "Edit announcement" : "New announcement"}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3.5">
					<div>
						<label htmlFor="ann-title" className="text-label text-text-tertiary block mb-1">
							Title
						</label>
						<Input
							id="ann-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="New leave policy 2026 is live"
						/>
					</div>
					<div>
						<label htmlFor="ann-body" className="text-label text-text-tertiary block mb-1">
							Body
						</label>
						<Textarea
							id="ann-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							rows={4}
							placeholder="What's changing, and from when…"
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<span className="text-label text-text-tertiary block mb-1">Category</span>
							<Select
								value={category}
								onValueChange={(v) => setCategory(v as AnnouncementCategory)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CATEGORIES.map((c) => (
										<SelectItem key={c.value} value={c.value}>
											{c.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<label
								htmlFor="ann-expires"
								className="text-label text-text-tertiary block mb-1"
							>
								Expires (optional)
							</label>
							<Input
								id="ann-expires"
								type="date"
								value={expiresAt}
								onChange={(e) => setExpiresAt(e.target.value)}
							/>
						</div>
					</div>
					<label className="flex items-center gap-2.5 cursor-pointer">
						<Switch checked={pinned} onCheckedChange={setPinned} />
						<span className="text-small text-text-secondary">
							Pin (the first pinned announcement is featured on the dashboard hero)
						</span>
					</label>
				</div>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button type="button" onClick={save} disabled={busy || !title.trim() || !body.trim()}>
						{busy ? "Saving…" : row ? "Save" : "Publish"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteDialog({
	row,
	onClose,
	onDeleted,
}: {
	row: Announcement;
	onClose: () => void;
	onDeleted: () => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);
	async function remove() {
		setBusy(true);
		try {
			await announcementApi.remove(row.id);
			toast.success("Announcement deleted");
			await onDeleted();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not delete");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete announcement?</DialogTitle>
				</DialogHeader>
				<p className="text-small text-text-secondary">
					“{row.title}” will be removed from the dashboard. This can't be undone.
				</p>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button
						type="button"
						className="bg-coral text-canvas hover:bg-coral/90"
						onClick={remove}
						disabled={busy}
					>
						{busy ? "Deleting…" : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
