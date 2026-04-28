type Holiday = { date: string; name: string; type: string };
type Props = { data: Record<string, unknown> };

export function UpcomingHolidaysCard({ data }: Props) {
	const holidays = (data.holidays as Holiday[]) ?? [];
	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Upcoming Holidays
			</h3>
			{holidays.length === 0 ? (
				<p className="text-xs text-slate-500">No upcoming holidays.</p>
			) : (
				<ul className="space-y-1">
					{holidays.map((h) => (
						<li key={h.date} className="text-xs flex justify-between">
							<span>{h.name}</span>
							<span className="text-slate-500">{h.date}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
