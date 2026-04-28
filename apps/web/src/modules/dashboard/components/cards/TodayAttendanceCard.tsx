import { DonutChart } from "@/components/hrms";

type Props = { data: Record<string, unknown> };

export function TodayAttendanceCard({ data }: Props) {
	const present = (data.present as number) ?? 0;
	const teamSize = (data.team_size as number) ?? 0;
	const absent = Math.max(0, teamSize - present);
	const pct = teamSize > 0 ? Math.round((present / teamSize) * 100) : 0;

	const segments =
		teamSize > 0
			? [
					{ value: present, color: "mint" as const, label: "Present" },
					{ value: absent, color: "coral" as const, label: "Absent" },
				]
			: [{ value: 1, color: "lavender" as const, label: "No data" }];

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-4">
				Team Attendance Today
			</h3>
			<DonutChart
				segments={segments}
				centerLabel={
					<span>
						<span className="text-h2 font-bold text-text-primary">{pct}%</span>
					</span>
				}
				size={80}
			/>
			<p className="text-small text-text-tertiary mt-3">
				{present} of {teamSize} present
			</p>
		</div>
	);
}
