import { cn } from "@/lib/utils";

import type { CalendarHoliday, CalendarStats } from "../api";
import { todayIsoLocal } from "../lib/local-date";
import { isWeekendIso, weekdayLabel } from "../lib/weekday";

export function StatsFooter({
	stats,
	holidays = [],
}: {
	stats: CalendarStats;
	holidays?: CalendarHoliday[];
}) {
	const dates = stats.by_day.map((d) => d.date);
	const holidaySet = new Set(holidays.map((h) => h.date));
	const today = todayIsoLocal();

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-3 overflow-x-auto">
			<table className="min-w-full border-separate border-spacing-x-1">
				<thead>
					<tr>
						<th className="text-left text-label uppercase text-text-tertiary px-2 py-1">
							Coverage
						</th>
						{dates.map((d) => {
							const wk = isWeekendIso(d);
							const hol = holidaySet.has(d);
							const isToday = d === today;
							return (
								<th
									key={d}
									className={cn(
										"text-center px-1 py-1 text-label uppercase align-bottom",
										wk && !hol && "bg-surface-elevated",
										hol && "bg-peach/10",
										isToday && "ring-1 ring-inset ring-accent-500/60 rounded",
									)}
								>
									<span
										className={cn(
											"block text-[10px] leading-none",
											hol ? "text-peach" : "text-text-tertiary",
										)}
									>
										{weekdayLabel(d, "narrow")}
									</span>
									<span
										className={cn(
											"block",
											hol ? "text-peach" : "text-text-secondary",
										)}
									>
										{new Date(`${d}T00:00:00Z`).getUTCDate()}
									</span>
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{stats.coverage.map((c) => (
						<tr key={c.team_id}>
							<td className="text-small text-text-tertiary px-2 py-0.5 whitespace-nowrap">
								{c.team_name}
							</td>
							{c.by_day.map((d) => {
								const zero = d.scheduled === 0 && d.min > 0;
								const short = d.scheduled < d.min;
								return (
									<td key={d.date} className="text-center px-1 py-0.5">
										<span
											title={`${d.scheduled} of ${d.min} scheduled`}
											className={cn(
												"font-mono text-xs px-1 rounded",
												zero
													? "bg-coral/20 text-coral"
													: short
														? "bg-yellow/20 text-yellow"
														: "bg-mint/20 text-mint",
											)}
										>
											{d.scheduled}/{d.min}
										</span>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
			<div className="flex items-center gap-4 text-small border-t border-border-subtle pt-2 mt-2">
				<span className="font-semibold text-text-primary">{`Hours: ${stats.totals.hours}`}</span>
				<span className="font-semibold text-text-primary">{`Headcount: ${stats.totals.headcount}`}</span>
			</div>
		</div>
	);
}
