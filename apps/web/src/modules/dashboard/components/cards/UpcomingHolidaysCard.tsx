import { StatusPill } from "@/components/hrms";

type Holiday = { date: string; name: string; type: string };

type StatusTone = "mint" | "yellow" | "coral" | "lavender" | "peach" | "sky";

function holidayTone(type: string): StatusTone {
	switch (type.toLowerCase()) {
		case "public":
			return "mint";
		case "optional":
			return "yellow";
		case "restricted":
			return "peach";
		default:
			return "lavender";
	}
}

type Props = { data: Record<string, unknown> };

export function UpcomingHolidaysCard({ data }: Props) {
	const holidays = (data.holidays as Holiday[]) ?? [];
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Upcoming Holidays
			</h3>
			{holidays.length === 0 ? (
				<p className="text-small text-text-tertiary">No upcoming holidays.</p>
			) : (
				<ul className="space-y-2">
					{holidays.map((h) => (
						<li
							key={h.date}
							className="text-small flex justify-between items-center gap-2"
						>
							<div className="min-w-0">
								<span className="text-text-primary">{h.name}</span>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<StatusPill tone={holidayTone(h.type)} label={h.type} />
								<span className="text-text-tertiary">{h.date}</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
