import { Pin } from "lucide-react";

import { StatusPill } from "@/components/hrms";
import type { CompanyAnnouncementsData, Tone } from "../../api";
import { WidgetCard } from "./WidgetCard";

const CATEGORY_TONE: Record<string, Tone> = {
	policy: "lavender",
	event: "sky",
	maintenance: "yellow",
	holiday: "mint",
	general: "peach",
};

export function AnnouncementsWidget({
	data,
}: {
	data: CompanyAnnouncementsData;
}) {
	const items = data.items ?? [];
	return (
		<WidgetCard title="Company announcements">
			{items.length === 0 ? (
				<p className="text-small text-text-tertiary">No announcements.</p>
			) : (
				<ul className="space-y-3">
					{items.map((a) => (
						<li key={a.id} className="flex items-start gap-2">
							{a.pinned && (
								<Pin
									className="size-3.5 text-yellow mt-0.5 shrink-0"
									aria-label="Pinned"
								/>
							)}
							<div className="min-w-0 flex-1">
								<p className="text-small text-text-primary truncate">
									{a.title}
								</p>
								<p className="text-small text-text-tertiary">
									{new Date(a.published_at).toLocaleDateString("en-MY")}
								</p>
							</div>
							<StatusPill
								tone={CATEGORY_TONE[a.category] ?? "peach"}
								label={a.category}
							/>
						</li>
					))}
				</ul>
			)}
		</WidgetCard>
	);
}
