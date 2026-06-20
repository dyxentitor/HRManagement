import type { AttendanceSummaryData, Tone } from "../../api";
import { WidgetCard } from "./WidgetCard";

const ROWS: { key: keyof AttendanceSummaryData; label: string; tone: Tone }[] = [
	{ key: "present", label: "Present", tone: "mint" },
	{ key: "late", label: "Late", tone: "yellow" },
	{ key: "absent", label: "Absent", tone: "coral" },
	{ key: "on_leave", label: "On leave", tone: "sky" },
	{ key: "partial", label: "Missing clock-in", tone: "peach" },
];

const BAR: Record<Tone, string> = {
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
	peach: "bg-peach",
	lavender: "bg-lavender",
};

export function AttendanceSummaryWidget({
	data,
}: {
	data: AttendanceSummaryData;
}) {
	const denom = Math.max(data.team_size, 1);
	return (
		<WidgetCard title="Attendance today">
			<ul className="space-y-2.5">
				{ROWS.map((r) => {
					const value = data[r.key] as number;
					const pct = Math.round((value / denom) * 100);
					return (
						<li key={r.key}>
							<div className="flex items-center justify-between text-small mb-1">
								<span className="text-text-secondary">{r.label}</span>
								<span className="text-text-tertiary tabular-nums">{value}</span>
							</div>
							<div className="h-1.5 bg-border-subtle/40 rounded-full overflow-hidden">
								<div
									className={`h-full rounded-full ${BAR[r.tone]}`}
									style={{ width: `${pct}%` }}
								/>
							</div>
						</li>
					);
				})}
			</ul>
		</WidgetCard>
	);
}
