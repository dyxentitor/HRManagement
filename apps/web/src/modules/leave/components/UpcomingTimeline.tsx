import { useMemo } from "react";

import { StatusPill } from "@/components/hrms";
import type { Holiday, LeaveRequest } from "../api";
import { daysUntil, formatRange, utcDate } from "../lib/leave-dates";
import { STATUS_TONE } from "../lib/leave-ui";

type Item =
	| { kind: "leave"; date: string; req: LeaveRequest }
	| { kind: "holiday"; date: string; name: string };

export interface UpcomingTimelineProps {
	requests: LeaveRequest[];
	holidays: Holiday[];
}

export function UpcomingTimeline({ requests, holidays }: UpcomingTimelineProps) {
	const items = useMemo<Item[]>(() => {
		const todayKey = new Date().toISOString().slice(0, 10);
		const out: Item[] = [];
		for (const r of requests) {
			if (r.end_date >= todayKey && r.status !== "cancelled" && r.status !== "rejected") {
				out.push({ kind: "leave", date: r.start_date, req: r });
			}
		}
		for (const h of holidays) {
			if (h.date >= todayKey) out.push({ kind: "holiday", date: h.date, name: h.name });
		}
		return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
	}, [requests, holidays]);

	if (items.length === 0) {
		return <p className="text-small text-text-tertiary">Nothing upcoming.</p>;
	}

	return (
		<ul className="space-y-3">
			{items.map((it) => {
				const d = utcDate(it.date);
				return (
					<li key={`${it.kind}-${it.date}`} className="flex gap-3">
						<div className="text-center w-9 shrink-0">
							<div className="text-h3 leading-none text-text-primary">{d.getUTCDate()}</div>
							<div className="text-[8px] uppercase text-text-tertiary">
								{d.toLocaleDateString("en-MY", { month: "short", timeZone: "UTC" })}
							</div>
						</div>
						<div
							className="flex-1 min-w-0 border-l pl-3"
							style={{ borderColor: "rgb(255 255 255 / 0.1)" }}
						>
							{it.kind === "leave" ? (
								<>
									<p className="text-small text-text-primary truncate">
										{it.req.leave_type_code} · {it.req.total_days}d
									</p>
									<p className="text-small text-text-tertiary flex items-center gap-1.5">
										{formatRange(it.req.start_date, it.req.end_date)}
										<StatusPill tone={STATUS_TONE[it.req.status]} label={it.req.status} />
									</p>
								</>
							) : (
								<>
									<p className="text-small text-text-primary truncate">{it.name}</p>
									<p className="text-small text-text-tertiary">
										Public holiday · in {daysUntil(it.date)} days
									</p>
								</>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
