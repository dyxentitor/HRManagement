type Props = { data: Record<string, unknown> };

export function TodayAttendanceCard({ data }: Props) {
	const present = (data.present as number) ?? 0;
	const teamSize = (data.team_size as number) ?? 0;
	const pct = teamSize > 0 ? Math.round((present / teamSize) * 100) : 0;

	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Team Attendance Today
			</h3>
			<p className="text-3xl font-bold text-green-600">
				{present}
				<span className="text-base text-slate-500 font-normal">
					{" "}
					/ {teamSize}
				</span>
			</p>
			<p className="text-xs text-slate-500 mt-1">{pct}% present</p>
		</div>
	);
}
