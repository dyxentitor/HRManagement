import type { ActivityFeedData, ActivityItem } from "../../api";

const VERB: Record<string, string> = {
	submit: "submitted",
	approve: "approved",
	reject: "rejected",
	cancel: "cancelled",
	publish: "published",
	create: "created",
	update: "updated",
};

function phrase(it: ActivityItem): string {
	// action may be "submit" or dotted like "employee.updated"
	const last = it.action.split(".").pop() ?? it.action;
	const verb = VERB[last] ?? last.replace(/_/g, " ");
	const subject = it.entity.replace(/_/g, " ").replace(/s$/, "");
	return `${verb} ${subject}`;
}

function initials(name: string): string {
	if (name === "System") return "◆";
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((p) => p.charAt(0).toUpperCase())
		.join("");
}

const AVATAR_TONES = ["bg-peach", "bg-lavender", "bg-mint", "bg-yellow", "bg-coral", "bg-sky"];

function timeOf(iso: string): string {
	return new Date(iso).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
}

export function ActivityTimeline({ data }: { data: ActivityFeedData }) {
	const items = data.items ?? [];
	return (
		<div className="rounded-xl p-5 border border-border-subtle bg-surface-hover h-full">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Recent activity
			</h3>
			{items.length === 0 ? (
				<p className="text-small text-text-tertiary">No recent activity.</p>
			) : (
				<ul className="space-y-0.5">
					{items.slice(0, 8).map((it, i) => (
						<li
							key={`${it.ts}-${it.entity_id}-${i}`}
							className="flex gap-3 py-2 text-small border-t border-border-subtle first:border-t-0"
						>
							<span className="text-text-tertiary tabular-nums w-11 shrink-0">
								{timeOf(it.ts)}
							</span>
							<span
								className={`size-6 rounded-full grid place-items-center text-[10px] font-bold text-canvas shrink-0 ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
								aria-hidden
							>
								{initials(it.actor)}
							</span>
							<span className="min-w-0">
								<span className="text-text-secondary">{phrase(it)}</span>
								<span className="block text-text-tertiary text-[10.5px]">
									{it.actor}
									{it.department ? ` · ${it.department}` : ""}
								</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
