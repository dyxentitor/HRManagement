const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type CardData = {
	type: string;
	title: string;
	data: Record<string, unknown>;
};

export type DashboardResponse = {
	variant: string;
	cards: CardData[];
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

export async function getDashboard(
	variant: "me" | "team" | "admin",
): Promise<DashboardResponse> {
	const resp = await authFetch(`${BASE_URL}/api/v1/dashboards/${variant}`);
	if (!resp.ok) throw new Error(`Dashboard fetch failed: ${resp.status}`);
	return resp.json();
}
