import { cn } from "@/lib/utils";

import type { CalendarStats } from "../api";

export function StatsFooter({ stats }: { stats: CalendarStats }) {
	return (
		<div className="space-y-2 bg-surface-hover border border-border-subtle rounded-lg p-3">
			{stats.coverage.map((c) => (
				<div key={c.team_id} className="flex items-center gap-2 text-small">
					<span className="text-text-tertiary w-20 shrink-0">
						{c.team_name}:
					</span>
					<div className="flex gap-1 flex-wrap">
						{c.by_day.map((d) => (
							<span
								key={d.date}
								aria-label={`${c.team_name} coverage on ${d.date}`}
								className={cn(
									"font-mono text-xs",
									d.ok ? "text-text-secondary" : "text-coral",
								)}
							>
								{d.scheduled}/{d.min}
							</span>
						))}
					</div>
				</div>
			))}
			<div className="flex items-center gap-4 text-small text-text-secondary border-t border-border-subtle pt-2">
				<span className="font-semibold text-text-primary">
					{`Hours: ${stats.totals.hours}`}
				</span>
				<span className="font-semibold text-text-primary">
					{`Headcount: ${stats.totals.headcount}`}
				</span>
			</div>
		</div>
	);
}
