import { MessageSquarePlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

import { type FeedbackCategory, type FeedbackItem, feedbackApi } from "../api";
import {
	CATEGORIES,
	CATEGORY_LABELS,
	STATUS_LABELS,
	STATUS_TONE,
	fmtDate,
} from "../lib/feedback-ui";

// Known module names for the "affected module" optional select
const KNOWN_MODULES = [
	"leave",
	"schedule",
	"attendance",
	"claims",
	"payslip",
	"kpi",
	"certification",
	"training",
	"reports",
	"notifications",
	"approvals",
	"dashboard",
	"announcements",
	"incentive",
	"feedback",
];

export default function FeedbackCenterPage() {
	const [items, setItems] = useState<FeedbackItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<FeedbackItem | null>(null);

	// Form state
	const [category, setCategory] = useState<FeedbackCategory | "">("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [affectedModule, setAffectedModule] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const list = await feedbackApi.listMine();
			setItems(list);
		} catch {
			// silent — table stays empty
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function uploadFile(feedbackId: string, f: File): Promise<void> {
		const ct = f.type || "application/octet-stream";
		const presigned = await feedbackApi.presignedUpload(feedbackId, {
			filename: f.name,
			content_type: ct,
		});
		const putResp = await fetch(presigned.presigned_url, {
			method: "PUT",
			headers: { "Content-Type": ct },
			body: f,
		});
		if (!putResp.ok) throw new Error(`S3 PUT failed: ${putResp.status}`);
		await feedbackApi.registerAttachment(feedbackId, {
			filename: f.name,
			content_type: ct,
			size_bytes: f.size,
			s3_key: presigned.s3_key,
		});
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!category) return;
		setFormError(null);
		setSubmitting(true);
		try {
			const created = await feedbackApi.create({
				category: category as FeedbackCategory,
				title,
				description,
				...(affectedModule ? { affected_module: affectedModule } : {}),
			});
			for (const f of files) {
				await uploadFile(created.id, f);
			}
			toast.success("Feedback submitted — thank you!");
			setCategory("");
			setTitle("");
			setDescription("");
			setAffectedModule("");
			setFiles([]);
			await refresh();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Submission failed");
		} finally {
			setSubmitting(false);
		}
	}

	const canSubmit =
		category !== "" && title.trim() !== "" && description.trim() !== "" && !submitting;

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
			key: "status",
			header: "Status",
			render: (row) => (
				<StatusPill
					tone={STATUS_TONE[row.status]}
					label={STATUS_LABELS[row.status] ?? row.status}
				/>
			),
		},
		{
			key: "created_at",
			header: "Submitted",
			render: (row) => (
				<span className="text-text-tertiary tabular-nums">{fmtDate(row.created_at)}</span>
			),
			sortable: true,
			sortValue: (row) => row.created_at,
		},
	];

	return (
		<div className="space-y-6">
			<PageHeader
				title="Feedback"
				subtitle="Report a bug, request a feature, or share a suggestion."
			/>

			<div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
				{/* Submit form */}
				<form onSubmit={onSubmit} className="glass-surface rounded-2xl p-5 space-y-4">
					<h2 className="text-h3 text-text-primary">Submit feedback</h2>

					<div>
						<label
							htmlFor="feedback-category"
							className="text-label uppercase text-text-tertiary block mb-1.5"
						>
							Category
						</label>
						<Select
							value={category}
							onValueChange={(v) => setCategory(v as FeedbackCategory)}
						>
							<SelectTrigger id="feedback-category" className="w-full">
								<SelectValue placeholder="Select a category…" />
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
							htmlFor="feedback-title"
							className="text-label uppercase text-text-tertiary block mb-1.5"
						>
							Title
						</label>
						<Input
							id="feedback-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Short summary of your feedback…"
							required
							aria-label="Title"
						/>
					</div>

					<div>
						<label
							htmlFor="feedback-description"
							className="text-label uppercase text-text-tertiary block mb-1.5"
						>
							Description
						</label>
						<Textarea
							id="feedback-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={4}
							placeholder="Describe the issue or idea in detail…"
							required
							aria-label="Description"
						/>
					</div>

					<div>
						<label
							htmlFor="feedback-affected-module"
							className="text-label uppercase text-text-tertiary block mb-1.5"
						>
							Affected module{" "}
							<span className="normal-case tracking-normal text-text-tertiary">· optional</span>
						</label>
						<Select value={affectedModule} onValueChange={setAffectedModule}>
							<SelectTrigger id="feedback-affected-module" className="w-full">
								<SelectValue placeholder="Pick a module if relevant…" />
							</SelectTrigger>
							<SelectContent>
								{KNOWN_MODULES.map((m) => (
									<SelectItem key={m} value={m}>
										{m.charAt(0).toUpperCase() + m.slice(1)}
									</SelectItem>
								))}
								<SelectItem value="other">Other</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1.5">
							Attachments{" "}
							<span className="normal-case tracking-normal text-text-tertiary">· optional</span>
						</span>
						<label
							htmlFor="feedback-file"
							className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-subtle rounded-lg p-5 cursor-pointer hover:border-accent-500/50 transition-colors duration-fast"
						>
							<MessageSquarePlus className="size-5 text-text-tertiary" aria-hidden />
							<span className="text-body text-text-secondary">
								Drop a file here or{" "}
								<span className="text-accent-200">browse</span>
							</span>
							<span className="text-small text-text-tertiary">
								Max 10 MB · Images, PDF, video
							</span>
							<input
								id="feedback-file"
								type="file"
								multiple
								className="sr-only"
								aria-label="Upload attachment"
								onChange={(e) => {
									if (e.target.files) {
										setFiles(Array.from(e.target.files));
									}
								}}
							/>
						</label>
						{files.length > 0 && (
							<ul className="mt-2 space-y-1">
								{files.map((f) => (
									<li key={f.name} className="text-small text-text-secondary truncate">
										{f.name}
									</li>
								))}
							</ul>
						)}
					</div>

					{formError && (
						<p role="alert" className="text-coral text-small">
							{formError}
						</p>
					)}

					<Button
						type="submit"
						disabled={!canSubmit}
						className="w-full soft-glow rounded-xl"
					>
						{submitting ? "Submitting…" : "Submit feedback"}
					</Button>
				</form>

				{/* My Feedback list */}
				<div className="glass-surface rounded-2xl p-5">
					<h2 className="text-h3 text-text-primary mb-4">My feedback</h2>
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
							onRowClick={setSelected}
							emptyState={
								<p className="text-body text-text-tertiary py-4 text-center">
									No feedback yet — submit your first above.
								</p>
							}
						/>
					)}
				</div>
			</div>

			{/* Detail panel */}
			<DetailPanel
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? selected.title : "Feedback"}
			>
				{selected && (
					<dl className="grid grid-cols-[100px_1fr] gap-y-2 text-body">
						<dt className="text-label uppercase text-text-tertiary self-center">Category</dt>
						<dd>{CATEGORY_LABELS[selected.category] ?? selected.category}</dd>

						<dt className="text-label uppercase text-text-tertiary self-center">Status</dt>
						<dd>
							<StatusPill
								tone={STATUS_TONE[selected.status]}
								label={STATUS_LABELS[selected.status] ?? selected.status}
							/>
						</dd>

						<dt className="text-label uppercase text-text-tertiary self-center">Submitted</dt>
						<dd className="tabular-nums">{fmtDate(selected.created_at)}</dd>

						{selected.affected_module && (
							<>
								<dt className="text-label uppercase text-text-tertiary self-center">Module</dt>
								<dd>{selected.affected_module}</dd>
							</>
						)}

						<dt className="text-label uppercase text-text-tertiary self-start">Description</dt>
						<dd className="whitespace-pre-wrap">{selected.description}</dd>

						{selected.attachments && selected.attachments.length > 0 && (
							<>
								<dt className="text-label uppercase text-text-tertiary self-start">
									Attachments
								</dt>
								<dd>
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
								</dd>
							</>
						)}
					</dl>
				)}
			</DetailPanel>
		</div>
	);
}
