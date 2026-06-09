import { Building2, CalendarDays, Flag, type LucideIcon, MapPin } from "lucide-react";

import type { CalendarHoliday } from "../api";
import { weekdayLabel } from "../lib/weekday";

const TYPE_META: Record<string, { label: string; Icon: LucideIcon }> = {
	federal: { label: "Federal", Icon: Flag },
	state: { label: "State", Icon: MapPin },
	company: { label: "Company", Icon: Building2 },
};

export interface HolidayCardProps {
	holiday: CalendarHoliday;
}

export function HolidayCard({ holiday }: HolidayCardProps) {
	const d = new Date(`${holiday.date}T00:00:00Z`);
	const day = d.getUTCDate();
	const monthAbbr = d
		.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
		.toUpperCase();
	const year = d.getUTCFullYear();
	const weekday = weekdayLabel(holiday.date, "long");
	const meta = TYPE_META[holiday.type] ?? {
		label: holiday.type || "Holiday",
		Icon: CalendarDays,
	};

	return (
		<div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-hover p-3">
			<div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-peach/15 text-peach">
				<span className="text-h3 font-bold leading-none">{day}</span>
				<span className="text-[10px] uppercase tracking-wide">{monthAbbr}</span>
			</div>
			<div className="min-w-0">
				<p className="text-body font-medium text-text-primary truncate">
					{holiday.name}
				</p>
				<p className="text-small text-text-tertiary">
					{weekday} · {year}
				</p>
				<span className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-secondary">
					<meta.Icon className="size-3" aria-hidden />
					{meta.label}
				</span>
			</div>
		</div>
	);
}
