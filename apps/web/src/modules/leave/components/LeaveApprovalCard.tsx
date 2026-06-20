import { useState } from "react";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "../api";
import { formatRange } from "../lib/leave-dates";
import { typeTone } from "../lib/leave-ui";

const AV_TONES = ["bg-peach", "bg-lavender", "bg-mint", "bg-sky", "bg-coral", "bg-yellow"];

function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p.charAt(0).toUpperCase())
			.join("") || "?"
	);
}

export interface LeaveApprovalCardProps {
	request: LeaveRequest;
	name: string;
	dept?: string;
	clash?: { count: number; names: string[] };
	selected: boolean;
	onToggleSelect: () => void;
	onApprove: (comment: string) => Promise<void>;
	onReject: (comment: string) => Promise<void>;
	tone: number;
}

export function LeaveApprovalCard({
	request,
	name,
	dept,
	clash,
	selected,
	onToggleSelect,
	onApprove,
	onReject,
	tone,
}: LeaveApprovalCardProps) {
	const [comment, setComment] = useState("");
	const [busy, setBusy] = useState(false);
	const hasClash = (clash?.count ?? 0) > 0;

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
				"bg-surface-hover border rounded-xl p-4",
				selected ? "border-accent-500/50" : "border-border-subtle",
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
						"size-9 rounded-full grid place-items-center text-canvas font-bold text-small shrink-0",
						AV_TONES[tone % AV_TONES.length],
					)}
					aria-hidden
				>
					{initials(name)}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="text-body text-text-primary truncate">
							<b>{name}</b>
							{dept && <span className="text-text-tertiary"> · {dept}</span>}
						</p>
					</div>
					<div className="flex items-center gap-2 mt-1.5">
						<StatusPill tone={typeTone(request.leave_type_code)} label={request.leave_type_code} />
						<span className="text-small text-text-secondary tabular-nums">
							{formatRange(request.start_date, request.end_date)} · {request.total_days}d
						</span>
					</div>
					{request.reason && (
						<p className="text-small text-text-tertiary italic mt-1.5">“{request.reason}”</p>
					)}
					<div className="mt-2.5">
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
					<div className="flex items-center gap-2 mt-3">
						<Input
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="Comment (required to reject)…"
							className="flex-1 h-8 text-small"
						/>
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
