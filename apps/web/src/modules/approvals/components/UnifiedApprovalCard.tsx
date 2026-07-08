import { useState } from "react";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ClaimReceipts, type ReceiptRef } from "@/modules/claims/components/ClaimReceipts";
import { formatRange } from "@/modules/leave/lib/leave-dates";

import type { InboxItem } from "../api";

const KIND_TONE = { leave: "yellow", claim: "peach", kpi: "sky" } as const;
const AVATAR_BG = { leave: "bg-yellow", claim: "bg-peach", kpi: "bg-sky" } as const;

function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p.charAt(0).toUpperCase())
			.join("") || "?"
	);
}

function str(v: unknown): string {
	return typeof v === "string" ? v : String(v ?? "");
}

function timeAgo(iso: string | null): string {
	if (!iso) return "";
	const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
	if (mins < 60) return `${Math.max(1, mins)}m ago`;
	const h = Math.floor(mins / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

export interface Clash {
	count: number;
	names: string[];
}

export interface UnifiedApprovalCardProps {
	item: InboxItem;
	clash?: Clash;
	selected: boolean;
	onToggleSelect: () => void;
	onApprove: (comment: string) => Promise<void>;
	onReject: (comment: string) => Promise<void>;
	onReview?: () => void;
}

/** What is being requested — the focal "big number" + context per kind. */
function What({ item, clash }: { item: InboxItem; clash?: Clash }) {
	const d = item.detail;
	if (item.kind === "claim") {
		const receipts = (d.attachments as ReceiptRef[] | undefined) ?? [];
		return (
			<>
				<div className="flex items-baseline gap-2.5 flex-wrap">
					<span className="text-2xl font-extralight tracking-tight tabular-nums">
						{str(d.currency_code)} {str(d.amount)}
					</span>
					<span className="text-small text-text-secondary">
						{item.type_code} · {str(d.expense_date)}
					</span>
				</div>
				<div className="mt-2">
					<ClaimReceipts claimId={item.id} attachments={receipts} />
				</div>
			</>
		);
	}
	if (item.kind === "leave") {
		const hasClash = (clash?.count ?? 0) > 0;
		return (
			<>
				<div className="flex items-baseline gap-2.5 flex-wrap">
					<span className="text-2xl font-extralight tracking-tight tabular-nums">
						{str(d.total_days)} days
					</span>
					<span className="text-small text-text-secondary">
						{item.type_code} · {formatRange(str(d.start_date), str(d.end_date))}
					</span>
				</div>
				<div className="mt-2">
					{hasClash ? (
						<span className="inline-block text-[10px] rounded-md px-2 py-1 bg-coral/10 border border-coral/25 text-coral">
							⚠ Coverage: {clash?.count} teammate(s) off
							{clash?.names.length ? ` — ${clash.names.slice(0, 2).join(", ")}` : ""}
						</span>
					) : (
						<span className="inline-block text-[10px] rounded-md px-2 py-1 bg-mint/10 border border-mint/25 text-mint">
							No coverage clash ✓
						</span>
					)}
				</div>
			</>
		);
	}
	return <span className="text-small text-text-secondary">{str(d.cycle)} cycle · self-review</span>;
}

export function UnifiedApprovalCard({
	item,
	clash,
	selected,
	onToggleSelect,
	onApprove,
	onReject,
	onReview,
}: UnifiedApprovalCardProps) {
	const [comment, setComment] = useState("");
	const [busy, setBusy] = useState(false);
	const name = item.name || item.employee_code;
	const reason = str(item.detail.reason);
	const meta = [item.department, item.employee_code].filter(Boolean).join(" · ");

	async function act(fn: (c: string) => Promise<void>) {
		setBusy(true);
		try {
			await fn(comment);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div
			className={cn(
				"glass-surface rounded-2xl p-4 transition-transform duration-fast hover:-translate-y-0.5",
				selected && "ring-1 ring-accent-500/50",
			)}
		>
			<div className="flex items-start gap-3">
				<input
					type="checkbox"
					checked={selected}
					onChange={onToggleSelect}
					className="mt-1.5"
					aria-label={`Select ${name}'s request`}
				/>
				<span
					className={cn(
						"size-10 rounded-full grid place-items-center text-canvas font-bold text-small shrink-0",
						AVATAR_BG[item.kind],
					)}
					aria-hidden
				>
					{initials(name)}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="text-body text-text-primary truncate">
								<b>{name}</b>
								{meta && <span className="text-text-tertiary"> · {meta}</span>}
							</p>
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<span className="text-[11px] text-text-tertiary">{timeAgo(item.submitted_at)}</span>
							<StatusPill tone={KIND_TONE[item.kind]} label={item.kind} />
						</div>
					</div>

					<div className="border-l-2 border-border-subtle pl-3 mt-2.5">
						<What item={item} clash={clash} />
						{reason && <p className="text-small text-text-tertiary italic mt-2">“{reason}”</p>}
					</div>

					<div className="flex items-center gap-2 mt-3">
						<Input
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="Comment (required to reject)…"
							className="flex-1 h-8 text-small"
						/>
						{onReview && (
							<Button type="button" variant="outline" size="sm" onClick={onReview}>
								Review
							</Button>
						)}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="border-coral/30 text-coral hover:bg-coral/10"
							disabled={busy}
							onClick={() => act(onReject)}
						>
							Reject
						</Button>
						<Button type="button" size="sm" disabled={busy} onClick={() => act(onApprove)}>
							Approve
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
