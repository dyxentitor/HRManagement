import { useNavigate } from "react-router-dom";

import {
	type Notification,
	markAllRead,
	markRead,
} from "@/modules/notifications/api";

type Props = {
	notifications: Notification[];
	onClose: () => void;
	onRead: (id: number) => void;
	onReadAll: () => void;
};

function groupByDate(
	notifications: Notification[],
): { label: string; items: Notification[] }[] {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const groups: { label: string; items: Notification[] }[] = [
		{ label: "Today", items: [] },
		{ label: "Yesterday", items: [] },
		{ label: "Older", items: [] },
	];

	for (const n of notifications) {
		const d = new Date(n.created_at);
		d.setHours(0, 0, 0, 0);
		if (d >= today) {
			groups[0].items.push(n);
		} else if (d >= yesterday) {
			groups[1].items.push(n);
		} else {
			groups[2].items.push(n);
		}
	}

	return groups.filter((g) => g.items.length > 0);
}

export function NotificationPanel({
	notifications,
	onClose,
	onRead,
	onReadAll,
}: Props) {
	const navigate = useNavigate();

	async function handleClickItem(n: Notification) {
		if (!n.read_at) {
			await markRead(n.id);
			onRead(n.id);
		}
		if (n.deep_link) {
			navigate(n.deep_link);
		}
		onClose();
	}

	async function handleReadAll() {
		await markAllRead();
		onReadAll();
	}

	const groups = groupByDate(notifications);

	return (
		<div className="absolute right-0 top-8 z-50 w-80 bg-white border border-slate-200 rounded shadow-lg">
			<div className="flex items-center justify-between px-4 py-2 border-b">
				<span className="font-semibold text-sm">Notifications</span>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={handleReadAll}
						className="text-xs text-blue-600 hover:underline"
					>
						Mark all read
					</button>
					<button
						type="button"
						onClick={onClose}
						className="text-slate-400 hover:text-slate-600 text-xs"
					>
						&#x2715;
					</button>
				</div>
			</div>
			<div className="max-h-96 overflow-y-auto">
				{groups.length === 0 && (
					<p className="text-sm text-slate-500 p-4 text-center">
						No notifications
					</p>
				)}
				{groups.map((g) => (
					<div key={g.label}>
						<p className="text-xs font-semibold text-slate-400 px-4 py-1 bg-slate-50">
							{g.label}
						</p>
						{g.items.map((n) => (
							<button
								key={n.id}
								type="button"
								onClick={() => handleClickItem(n)}
								className={`w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-b-0 ${
									!n.read_at ? "bg-blue-50" : ""
								}`}
							>
								<p className="text-sm font-medium text-slate-800">{n.type}</p>
								<p className="text-xs text-slate-500 mt-0.5">
									{new Date(n.created_at).toLocaleTimeString()}
								</p>
							</button>
						))}
					</div>
				))}
			</div>
			<div className="px-4 py-2 border-t text-center">
				<a
					href="/notifications/preferences"
					onClick={(e) => {
						e.preventDefault();
						navigate("/notifications/preferences");
						onClose();
					}}
					className="text-xs text-blue-600 hover:underline"
				>
					Notification preferences
				</a>
			</div>
		</div>
	);
}
