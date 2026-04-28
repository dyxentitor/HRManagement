import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";

export interface NotificationDTO {
	id: string;
	type: string;
	title: string;
	body: string;
	created_at: string;
	read_at: string | null;
	deep_link?: string;
}

export interface NotificationCardProps {
	notification: NotificationDTO;
	onRead: (id: string) => void;
}

const TYPE_TONE: Record<string, string> = {
	leave_approved: "bg-mint/15 text-mint",
	leave_rejected: "bg-coral/15 text-coral",
	claim_approved: "bg-mint/15 text-mint",
	claim_rejected: "bg-coral/15 text-coral",
	cert_expiring: "bg-yellow/15 text-yellow",
	approval_requested: "bg-peach/15 text-peach",
	system: "bg-sky/15 text-sky",
};

function timeAgo(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diffMs / 60000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	return `${Math.floor(h / 24)}d`;
}

export function NotificationCard({
	notification,
	onRead,
}: NotificationCardProps) {
	const nav = useNavigate();
	const tone = TYPE_TONE[notification.type] ?? TYPE_TONE.system;
	const unread = !notification.read_at;

	const click = () => {
		onRead(notification.id);
		if (notification.deep_link) nav(notification.deep_link);
	};

	return (
		<button
			type="button"
			onClick={click}
			className={cn(
				"flex w-full items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors duration-fast",
				"hover:bg-surface-hover focus-visible:bg-surface-hover",
			)}
			aria-label={notification.title}
		>
			<span
				className={cn(
					"size-7 rounded-full grid place-items-center text-small font-bold shrink-0",
					tone,
				)}
				aria-hidden
			>
				●
			</span>
			<div className="flex-1 min-w-0">
				<p className="text-h3 text-text-primary truncate">
					{notification.title}
				</p>
				<p className="text-small text-text-tertiary truncate">
					{notification.body}
				</p>
			</div>
			<div className="flex flex-col items-end gap-1 shrink-0">
				<span className="text-small text-text-tertiary">
					{timeAgo(notification.created_at)}
				</span>
				{unread && (
					<span
						className="size-2 rounded-full bg-peach"
						aria-label="Unread notification"
					/>
				)}
			</div>
		</button>
	);
}
