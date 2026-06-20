const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export type InboxItem = {
	kind: "leave" | "claim" | "kpi";
	id: string;
	employee_code: string;
	summary: string;
	submitted_at: string | null;
	deep_link: string;
	// structured fields (v1.14.1) for rich cards + leave coverage
	employee_id: string;
	name: string;
	type_code: string;
	detail: Record<string, unknown>;
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

export async function approveItem(
	kind: InboxItem["kind"],
	id: string,
	comment: string,
): Promise<void> {
	if (kind === "leave") {
		const resp = await authFetch(
			`${BASE_URL}/api/v1/leave/requests/${id}/approve/`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ comment }),
			},
		);
		if (!resp.ok) throw new Error(`Approve failed (${resp.status})`);
	} else if (kind === "claim") {
		const resp = await authFetch(`${BASE_URL}/api/v1/claims/${id}/approve/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ comment }),
		});
		if (!resp.ok) throw new Error(`Approve failed (${resp.status})`);
	} else if (kind === "kpi") {
		// KPI "approve" = submit the manager review with an action field
		const resp = await authFetch(
			`${BASE_URL}/api/v1/kpi/reviews/${id}/manager/`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "approve",
					scores: {},
					overall_comment: comment,
				}),
			},
		);
		if (!resp.ok) throw new Error(`Approve failed (${resp.status})`);
	} else {
		throw new Error(`Unsupported approval kind: ${kind}`);
	}
}

export async function rejectItem(
	kind: InboxItem["kind"],
	id: string,
	comment: string,
): Promise<void> {
	if (kind === "leave") {
		const resp = await authFetch(
			`${BASE_URL}/api/v1/leave/requests/${id}/reject/`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ comment }),
			},
		);
		if (!resp.ok) throw new Error(`Reject failed (${resp.status})`);
	} else if (kind === "claim") {
		const resp = await authFetch(`${BASE_URL}/api/v1/claims/${id}/reject/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ comment }),
		});
		if (!resp.ok) throw new Error(`Reject failed (${resp.status})`);
	} else if (kind === "kpi") {
		// KPI "reject" = submit manager review with reject action
		const resp = await authFetch(
			`${BASE_URL}/api/v1/kpi/reviews/${id}/manager/`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "reject",
					scores: {},
					overall_comment: comment,
				}),
			},
		);
		if (!resp.ok) throw new Error(`Reject failed (${resp.status})`);
	} else {
		throw new Error(`Unsupported approval kind: ${kind}`);
	}
}
