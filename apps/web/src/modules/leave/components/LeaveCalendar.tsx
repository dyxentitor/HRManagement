import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { Holiday, LeaveRequest } from "../api";
import { dateKeysBetween, ymd } from "../lib/leave-dates";
import { TONE_BG, type Tone, typeTone } from "../lib/leave-ui";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayMark {
	tone: Tone;
	pending: boolean;
	code: string;
}

export interface LeaveCalendarProps {
	month: Date; // any UTC date within the month to show
	requests: LeaveRequest[];
	holidays: Holiday[];
}

export function LeaveCalendar({ month, requests, holidays }: LeaveCalendarProps) {
	const year = month.getUTCFullYear();
	const m = month.getUTCMonth();

	const leaveByDay = useMemo(() => {
		const map = new Map<string, DayMark>();
		for (const r of requests) {
			if (r.status !== "approved" && r.status !== "submitted") continue;
			for (const key of dateKeysBetween(r.start_date, r.end_date)) {
				map.set(key, {
					tone: typeTone(r.leave_type_code),
					pending: r.status === "submitted",
					code: r.leave_type_code,
				});
			}
		}
		return map;
	}, [requests]);

	const holidayByDay = useMemo(() => {
		const map = new Map<string, string>();
		for (const h of holidays) map.set(h.date, h.name);
		return map;
	}, [holidays]);

	const cells = useMemo(() => {
		const first = new Date(Date.UTC(year, m, 1));
		const firstDow = (first.getUTCDay() + 6) % 7; // Mon=0
		const start = new Date(first);
		start.setUTCDate(start.getUTCDate() - firstDow);
		const todayKey = ymd(new Date(`${ymd(new Date())}T00:00:00Z`));
		return Array.from({ length: 42 }, (_, i) => {
			const d = new Date(start);
			d.setUTCDate(start.getUTCDate() + i);
			const key = ymd(d);
			return {
				key,
				day: d.getUTCDate(),
				inMonth: d.getUTCMonth() === m,
				weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
				today: key === todayKey,
				leave: leaveByDay.get(key),
				holiday: holidayByDay.get(key),
			};
		});
	}, [year, m, leaveByDay, holidayByDay]);

	return (
		<div>
			<div className="grid grid-cols-7 gap-1.5 mb-1">
				{DOW.map((d) => (
					<div key={d} className="text-[9px] uppercase text-text-tertiary text-center">
						{d}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7 gap-1.5">
				{cells.map((c) => (
					<div
						key={c.key}
						title={c.holiday ?? (c.leave ? `${c.leave.code} leave` : undefined)}
						className={cn(
							"min-h-[44px] rounded-lg border border-border-subtle p-1.5 text-small",
							!c.inMonth && "opacity-25",
							c.weekend && "bg-surface-hover/40",
							c.today && "border-sky",
						)}
					>
						<span className={c.today ? "text-text-primary font-semibold" : ""}>{c.day}</span>
						{c.leave && (
							<span
								className={cn(
									"block mt-1 text-[8px] font-semibold rounded px-1 text-canvas truncate",
									TONE_BG[c.leave.tone],
									c.leave.pending && "opacity-70",
								)}
							>
								{c.leave.code}
							</span>
						)}
						{!c.leave && c.holiday && (
							<span className="block mt-1 text-[8px] font-semibold rounded px-1 bg-mint/20 text-mint truncate">
								Holiday
							</span>
						)}
					</div>
				))}
			</div>
			<div className="flex flex-wrap gap-3 mt-3 text-[10px] text-text-tertiary">
				<span className="flex items-center gap-1.5">
					<span className="size-2 rounded-full bg-lavender" /> Your leave
				</span>
				<span className="flex items-center gap-1.5">
					<span className="size-2 rounded-full bg-mint" /> Public holiday
				</span>
			</div>
		</div>
	);
}
