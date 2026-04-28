const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type InboxItem = {
	kind: "leave" | "claim";
	id: string;
	employee_code: string;
	summary: string;
	submitted_at: string | null;
	deep_link: string;
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

export async function getInbox(): Promise<InboxItem[]> {
	const resp = await authFetch(`${BASE_URL}/api/v1/approvals/inbox`);
	if (!resp.ok) return [];
	return resp.json();
}
