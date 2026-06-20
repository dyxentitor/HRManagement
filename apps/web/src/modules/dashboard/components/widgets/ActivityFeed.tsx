import type { ActivityFeedData } from "../../api";
import { WidgetCard } from "./WidgetCard";

function describe(action: string, entity: string): string {
	const verb =
		{
			submit: "submitted",
			approve: "approved",
			reject: "rejected",
			cancel: "cancelled",
			publish: "published",
			create: "created",
			update: "updated",
		}[action] ?? action;
	const subject = entity.replace(/_/g, " ");
	return `${verb} ${subject}`;
}

function timeOf(iso: string): string {
	return new Date(iso).toLocaleTimeString("en-MY", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function ActivityFeed({ data }: { data: ActivityFeedData }) {
	const items = data.items ?? [];
	return (
		<WidgetCard title="Recent activity">
			{items.length === 0 ? (
				<p className="text-small text-text-tertiary">No recent activity.</p>
			) : (
				<ul className="space-y-3">
					{items.slice(0, 8).map((it, i) => (
						<li
							key={`${it.ts}-${it.entity_id}-${i}`}
							className="flex gap-3 text-small"
						>
							<span className="text-text-tertiary tabular-nums shrink-0 w-12">
								{timeOf(it.ts)}
							</span>
							<span className="text-text-secondary min-w-0">
								<span className="text-text-primary font-medium">{it.actor}</span>{" "}
								{describe(it.action, it.entity)}
							</span>
						</li>
					))}
				</ul>
			)}
		</WidgetCard>
	);
}
