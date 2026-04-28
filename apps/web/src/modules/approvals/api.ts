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

const PATH_BY_KIND: Record<InboxItem["kind"], string> = {
	leave: "/api/v1/leave/requests",
	claim: "/api/v1/claims",
	// kpi: "/api/v1/kpi/reviews",  // add when backend exposes kpi inbox
};

export async function approveItem(
	kind: InboxItem["kind"],
	id: string,
	comment: string,
): Promise<void> {
	const path = PATH_BY_KIND[kind];
	if (!path) throw new Error(`Unsupported approval kind: ${kind}`);
	const resp = await authFetch(`${BASE_URL}${path}/${id}/approve/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ comment }),
	});
	if (!resp.ok) throw new Error(`Approve failed (${resp.status})`);
}

export async function rejectItem(
	kind: InboxItem["kind"],
	id: string,
	comment: string,
): Promise<void> {
	const path = PATH_BY_KIND[kind];
	if (!path) throw new Error(`Unsupported approval kind: ${kind}`);
	const resp = await authFetch(`${BASE_URL}${path}/${id}/reject/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ comment }),
	});
	if (!resp.ok) throw new Error(`Reject failed (${resp.status})`);
}
