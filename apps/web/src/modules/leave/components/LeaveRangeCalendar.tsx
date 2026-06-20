import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { Holiday } from "../api";
import { ymd } from "../lib/leave-dates";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface LeaveRangeCalendarProps {
	value: { start: string; end: string };
	onChange: (v: { start: string; end: string }) => void;
	holidays: Holiday[];
	/** date key → number of teammates already off that day */
	coverage?: Record<string, number>;
}

export function LeaveRangeCalendar({
	value,
	onChange,
	holidays,
	coverage = {},
}: LeaveRangeCalendarProps) {
	const [view, setView] = useState(() => {
		const base = value.start ? new Date(`${value.start}T00:00:00Z`) : new Date();
		return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
	});
	const [pickingEnd, setPickingEnd] = useState(false);

	const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);

	function click(key: string) {
		if (!pickingEnd) {
			onChange({ start: key, end: key });
			setPickingEnd(true);
		} else {
			if (key >= value.start) {
				onChange({ start: value.start, end: key });
			} else {
				onChange({ start: key, end: key });
			}
			setPickingEnd(false);
		}
	}

	const cells = useMemo(() => {
		const y = view.getUTCFullYear();
		const m = view.getUTCMonth();
		const first = new Date(Date.UTC(y, m, 1));
		const firstDow = (first.getUTCDay() + 6) % 7;
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
				holiday: holidaySet.has(key),
				clash: coverage[key] ?? 0,
				selected: value.start && key >= value.start && key <= value.end,
				isEnd: key === value.start || key === value.end,
			};
		});
	}, [view, holidaySet, coverage, value]);

	const monthLabel = view.toLocaleDateString("en-MY", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

	function shift(delta: number) {
		setView((v) => new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + delta, 1)));
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-2">
				<span className="text-label font-semibold text-text-secondary">
					Pick your dates — click start, then end
				</span>
				<span className="text-small text-text-tertiary flex items-center gap-2">
					<button type="button" onClick={() => shift(-1)} aria-label="Previous month">
						‹
					</button>
					<span className="text-text-secondary w-28 text-center">{monthLabel}</span>
					<button type="button" onClick={() => shift(1)} aria-label="Next month">
						›
					</button>
				</span>
			</div>
			<div className="grid grid-cols-7 gap-1.5 mb-1">
				{DOW.map((d) => (
					<div key={d} className="text-[9px] uppercase text-text-tertiary text-center">
						{d}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7 gap-1.5">
				{cells.map((c) => (
					<button
						key={c.key}
						type="button"
						onClick={() => click(c.key)}
						title={c.clash ? `${c.clash} teammate(s) off` : undefined}
						className={cn(
							"min-h-[40px] rounded-lg border p-1 text-small text-left relative transition-colors",
							c.inMonth ? "border-border-subtle" : "border-transparent opacity-25",
							c.weekend && !c.selected && "bg-surface-hover/40",
							c.today && !c.selected && "border-sky",
							c.selected && !c.isEnd && "bg-accent-500/25 border-accent-500/40",
							c.isEnd && c.selected && "bg-accent-500 border-accent-500 text-white font-semibold",
						)}
					>
						{c.day}
						{c.holiday && (
							<span className="block text-[8px] text-mint truncate">Holiday</span>
						)}
						{!c.holiday && c.clash > 0 && (
							<span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-coral" />
						)}
					</button>
				))}
			</div>
		</div>
	);
}
