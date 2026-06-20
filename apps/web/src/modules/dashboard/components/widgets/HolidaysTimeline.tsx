import { StatusPill } from "@/components/hrms";
import type { Tone } from "../../api";
import { WidgetCard } from "./WidgetCard";

type Holiday = { date: string; name: string; type: string };

function holidayTone(type: string): Tone {
	switch (type.toLowerCase()) {
		case "federal":
		case "public":
			return "mint";
		case "state":
			return "yellow";
		case "company":
			return "lavender";
		default:
			return "peach";
	}
}

function daysUntil(iso: string): number {
	const today = new Date();
	const todayUtc = Date.UTC(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);
	const target = new Date(`${iso}T00:00:00Z`).getTime();
	return Math.round((target - todayUtc) / 86_400_000);
}

export function HolidaysTimeline({ data }: { data: { holidays?: Holiday[] } }) {
	const holidays = data.holidays ?? [];
	return (
		<WidgetCard title="Upcoming holidays">
			{holidays.length === 0 ? (
				<p className="text-small text-text-tertiary">No upcoming holidays.</p>
			) : (
				<ul className="space-y-3">
					{holidays.map((h) => {
						const d = daysUntil(h.date);
						const remaining =
							d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days`;
						return (
							<li key={h.date} className="flex items-center gap-3">
								<div className="flex flex-col items-center justify-center bg-canvas/60 border border-border-subtle rounded-md w-12 py-1 shrink-0">
									<span className="text-h2 text-text-primary leading-none">
										{new Date(`${h.date}T00:00:00Z`).getUTCDate()}
									</span>
									<span className="text-[10px] uppercase text-text-tertiary">
										{new Date(`${h.date}T00:00:00Z`).toLocaleDateString("en-MY", {
											month: "short",
											timeZone: "UTC",
										})}
									</span>
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-small text-text-primary truncate">{h.name}</p>
									<p className="text-small text-text-tertiary">{remaining}</p>
								</div>
								<StatusPill tone={holidayTone(h.type)} label={h.type} />
							</li>
						);
					})}
				</ul>
			)}
		</WidgetCard>
	);
}
