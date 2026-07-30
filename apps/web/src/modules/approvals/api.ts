import { authedFetch } from "@/lib/authed-fetch";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Shared client: token header + app-wide 401 → refresh → retry.
const authFetch = authedFetch;

export type InboxItem = {
	kind: "leave" | "claim" | "kpi" | "incentive";
	id: string;
	employee_code: string;
	summary: string;
	submitted_at: string | null;
	deep_link: string;
	// structured fields (v1.14.1) for rich cards + leave coverage
	employee_id: string;
	name: string;
	department: string;
	type_code: string;
	detail: Record<string, unknown>;
};


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
		const resp = await authFetch(`${BASE_URL}/api/v1/leave/requests/${id}/approve/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ comment }),
		});
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
		const resp = await authFetch(`${BASE_URL}/api/v1/kpi/reviews/${id}/manager/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "approve",
				scores: {},
				overall_comment: comment,
			}),
		});
		if (!resp.ok) throw new Error(`Approve failed (${resp.status})`);
	} else if (kind === "incentive") {
		const resp = await authFetch(`${BASE_URL}/api/v1/incentive/claims/${id}/approve/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
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
		const resp = await authFetch(`${BASE_URL}/api/v1/leave/requests/${id}/reject/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ comment }),
		});
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
		const resp = await authFetch(`${BASE_URL}/api/v1/kpi/reviews/${id}/manager/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "reject",
				scores: {},
				overall_comment: comment,
			}),
		});
		if (!resp.ok) throw new Error(`Reject failed (${resp.status})`);
	} else if (kind === "incentive") {
		const resp = await authFetch(`${BASE_URL}/api/v1/incentive/claims/${id}/reject/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reason: comment }),
		});
		if (!resp.ok) throw new Error(`Reject failed (${resp.status})`);
	} else {
		throw new Error(`Unsupported approval kind: ${kind}`);
	}
}
