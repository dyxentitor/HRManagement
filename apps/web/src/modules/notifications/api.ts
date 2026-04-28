const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type NotificationChannel = "in_app" | "email";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type Notification = {
	id: number;
	type: string;
	channel: NotificationChannel;
	payload: Record<string, unknown>;
	deep_link: string;
	priority: NotificationPriority;
	delivery_status: string;
	read_at: string | null;
	created_at: string;
};

export type NotificationPreference = {
	id: number;
	type: string;
	channel: NotificationChannel;
	enabled: boolean;
};

async function authFetch(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const headers = new Headers(options.headers);
	if (token) headers.set("Authorization", `Bearer ${token}`);
	return fetch(url, { ...options, headers });
}

export async function listNotifications(
	unreadOnly = false,
	limit = 20,
): Promise<Notification[]> {
	const params = new URLSearchParams({ limit: String(limit) });
	if (unreadOnly) params.set("unread_only", "true");
	const resp = await authFetch(
		`${BASE_URL}/api/v1/notifications?${params.toString()}`,
	);
	if (!resp.ok) return [];
	return resp.json();
}

export async function markRead(id: number): Promise<Notification | null> {
	const resp = await authFetch(`${BASE_URL}/api/v1/notifications/${id}/read`, {
		method: "PATCH",
	});
	if (!resp.ok) return null;
	return resp.json();
}

export async function markAllRead(): Promise<{ updated: number }> {
	const resp = await authFetch(`${BASE_URL}/api/v1/notifications/read-all`, {
		method: "POST",
	});
	if (!resp.ok) return { updated: 0 };
	return resp.json();
}

export async function getPreferences(): Promise<NotificationPreference[]> {
	const resp = await authFetch(`${BASE_URL}/api/v1/notifications/preferences`);
	if (!resp.ok) return [];
	return resp.json();
}

export async function updatePreferences(
	updates: Array<{
		type: string;
		channel: NotificationChannel;
		enabled: boolean;
	}>,
): Promise<NotificationPreference[]> {
	const resp = await authFetch(`${BASE_URL}/api/v1/notifications/preferences`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(updates),
	});
	if (!resp.ok) return [];
	return resp.json();
}
