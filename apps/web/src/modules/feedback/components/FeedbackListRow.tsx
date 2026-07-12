import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { gradientFromName } from "@/components/hrms/avatar-gradient";
import { StatusPill } from "@/components/hrms";
import type { FeedbackItem } from "../api";
import { STATUS_TONE, STATUS_LABELS, CATEGORY_LABELS, relativeTime } from "../lib/feedback-ui";

interface FeedbackListRowProps {
	item: FeedbackItem;
	selected: boolean;
	onClick: () => void;
}

export function FeedbackListRow({ item, selected, onClick }: FeedbackListRowProps) {
	const isNew = item.status === "new";
	const reporterFirst = (item.reporter_name ?? "").split(" ")[0];
	const assigneeName = item.assignee_name ?? null;

	const [g1, g2] = assigneeName ? gradientFromName(assigneeName) : ["lavender", "sky"];
	const assigneeInitials = assigneeName
		? assigneeName
				.split(" ")
				.slice(0, 2)
				.map((w) => w[0] ?? "")
				.join("")
				.toUpperCase()
		: "";

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full text-left flex gap-2.5 px-3 py-2.5 rounded-lg transition-colors duration-fast",
				selected
					? "bg-surface-hover ring-1 ring-accent-500/60"
					: "hover:bg-surface-hover",
			)}
		>
			{/* Status dot — accent when new, transparent otherwise */}
			<span
				aria-hidden
				className={cn(
					"mt-1.5 h-[7px] w-[7px] rounded-full flex-none",
					isNew ? "bg-sky" : "bg-transparent",
				)}
			/>

			{/* Row content */}
			<div className="flex-1 min-w-0">
				{/* Category */}
				<p className="text-label uppercase text-text-tertiary">
					{CATEGORY_LABELS[item.category] ?? item.category}
				</p>

				{/* Title */}
				<p className="text-small font-semibold text-text-primary truncate mt-0.5">
					{item.title}
				</p>

				{/* Bottom row */}
				<div className="flex items-center gap-1.5 mt-1">
					<StatusPill
						tone={STATUS_TONE[item.status]}
						label={STATUS_LABELS[item.status] ?? item.status}
					/>

					{assigneeName ? (
						<>
							<Avatar className="h-[18px] w-[18px] flex-none">
								<AvatarFallback
									className="text-[9px] font-bold text-canvas"
									style={{
										background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
										// biome-ignore lint/suspicious/noExplicitAny: inline style gradient
										["--tw-gradient-from" as any]: `rgb(var(--pastel-${g1}))`,
										["--tw-gradient-to" as any]: `rgb(var(--pastel-${g2}))`,
									}}
								>
									{assigneeInitials}
								</AvatarFallback>
							</Avatar>
							<span className="text-small text-text-tertiary truncate">
								{assigneeName.split(" ")[0]}
							</span>
						</>
					) : (
						<span className="text-small text-text-tertiary">Unassigned</span>
					)}

					<span className="text-small text-text-tertiary">
						{reporterFirst ? `${reporterFirst} · ` : ""}{relativeTime(item.created_at)}
					</span>
				</div>
			</div>
		</button>
	);
}
