import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { LeaveRequest } from "../api";
import { formatRange } from "../lib/leave-dates";
import { type Tone, fmtDays } from "../lib/leave-ui";

interface Event {
	ts: string;
	text: string;
	tone: Tone;
}

function eventFor(r: LeaveRequest): Event | null {
	const range = formatRange(r.start_date, r.end_date);
	const type = r.leave_type_code;
	const ts = r.submitted_at ?? `${r.start_date}T00:00:00Z`;
	if (r.status === "approved")
		return { ts, text: `Manager approved your ${type} leave · ${range}`, tone: "mint" };
	if (r.status === "rejected")
		return { ts, text: `Your ${type} leave was rejected`, tone: "coral" };
	if (r.status === "submitted")
		return { ts, text: `You submitted ${type} leave · ${fmtDays(r.total_days)}`, tone: "sky" };
	return null;
}

const DOT: Record<Tone, string> = {
	mint: "bg-mint",
	coral: "bg-coral",
	lavender: "bg-lavender",
	sky: "bg-sky",
	yellow: "bg-yellow",
	peach: "bg-peach",
};

function timeLabel(iso: string): string {
	const d = new Date(iso);
	const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
	if (days <= 0) return d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
	if (days === 1) return "Yesterday";
	return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function LeaveActivityTimeline({ requests }: { requests: LeaveRequest[] }) {
	const events = useMemo(
		() =>
			requests
				.map(eventFor)
				.filter((e): e is Event => e !== null)
				.sort((a, b) => b.ts.localeCompare(a.ts))
				.slice(0, 6),
		[requests],
	);

	return (
		<section>
			<p className="layer-eyebrow mb-3">Activity</p>
			{events.length === 0 ? (
				<p className="text-small text-text-tertiary">No activity yet.</p>
			) : (
				<ol className="relative pl-5">
					<span
						className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border-subtle"
						aria-hidden
					/>
					{events.map((e, i) => (
						<li key={`${e.ts}-${i}`} className="relative pb-5 last:pb-0">
							<span
								className={cn(
									"absolute -left-5 top-1.5 size-[7px] rounded-full ring-4 ring-canvas",
									DOT[e.tone],
								)}
								aria-hidden
							/>
							<p className="text-small text-text-secondary leading-snug">{e.text}</p>
							<p className="text-[11px] text-text-tertiary mt-0.5">{timeLabel(e.ts)}</p>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
