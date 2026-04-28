import { useCallback, useEffect, useRef, useState } from "react";

import {
	type Notification,
	listNotifications,
} from "@/modules/notifications/api";

import { NotificationPanel } from "./NotificationPanel";

export function NotificationBell() {
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [panelOpen, setPanelOpen] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const fetchNotifications = useCallback(async () => {
		const data = await listNotifications(false, 20);
		setNotifications(data);
	}, []);

	useEffect(() => {
		fetchNotifications();
		intervalRef.current = setInterval(fetchNotifications, 60_000);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [fetchNotifications]);

	const unreadCount = notifications.filter((n) => !n.read_at).length;

	function handleRead(id: number) {
		setNotifications((prev) =>
			prev.map((n) =>
				n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
			),
		);
	}

	function handleReadAll() {
		setNotifications((prev) =>
			prev.map((n) => ({
				...n,
				read_at: n.read_at ?? new Date().toISOString(),
			})),
		);
	}

	return (
		<div className="relative">
			<button
				type="button"
				aria-label="Notifications"
				onClick={() => setPanelOpen((o) => !o)}
				className="relative text-text-secondary hover:text-text-primary px-1"
			>
				<span aria-hidden>&#x1F514;</span>
				{unreadCount > 0 && (
					<span className="absolute -top-1 -right-1 bg-coral text-canvas text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
						{unreadCount > 9 ? "9+" : unreadCount}
					</span>
				)}
			</button>
			{panelOpen && (
				<NotificationPanel
					notifications={notifications}
					onClose={() => setPanelOpen(false)}
					onRead={handleRead}
					onReadAll={handleReadAll}
				/>
			)}
		</div>
	);
}
