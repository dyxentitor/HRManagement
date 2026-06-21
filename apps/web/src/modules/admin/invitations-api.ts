const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export type InvitationStatus = "draft" | "sent" | "opened" | "activated" | "revoked" | "expired";

export interface InvitationRow {
	id: string;
	user_id: string;
	employee_id: string | null;
	email: string;
	status: InvitationStatus;
	effective_status: InvitationStatus;
	expires_at: string;
	sent_at: string | null;
	opened_at: string | null;
	activated_at: string | null;
	revoked_at: string | null;
	sent_count: number;
	created_at: string;
	employee_name: string;
	department: string | null;
}

export interface InvitationActivity {
	action: string;
	ts: string;
	after: Record<string, unknown> | null;
	ip: string | null;
	user_agent: string | null;
	actor_id: string | null;
}

async function authHeaders(json = false): Promise<Headers> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const headers = new Headers();
	if (token) headers.set("Authorization", `Bearer ${token}`);
	if (json) headers.set("Content-Type", "application/json");
	return headers;
}

function unwrap<T>(d: { results?: T[] } | T[]): T[] {
	return Array.isArray(d) ? d : (d.results ?? []);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	const resp = await fetch(`${BASE_URL}/api/v1${path}`, init);
	if (resp.status === 403) throw new Error("You don't have permission to manage invitations.");
	if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
	return resp.json();
}

export const invitationsApi = {
	list: async (): Promise<InvitationRow[]> =>
		unwrap(
			await req<{ results?: InvitationRow[] } | InvitationRow[]>("/invitations/", {
				headers: await authHeaders(),
			}),
		),

	resend: async (id: string): Promise<InvitationRow> =>
		req(`/invitations/${id}/resend/`, { method: "POST", headers: await authHeaders() }),

	revoke: async (id: string): Promise<InvitationRow> =>
		req(`/invitations/${id}/revoke/`, { method: "POST", headers: await authHeaders() }),

	extend: async (id: string, hours = 48): Promise<InvitationRow> =>
		req(`/invitations/${id}/extend/`, {
			method: "POST",
			headers: await authHeaders(true),
			body: JSON.stringify({ hours }),
		}),

	activity: async (id: string): Promise<InvitationActivity[]> =>
		req(`/invitations/${id}/activity/`, { headers: await authHeaders() }),

	/** Mint a fresh activation link to copy (rotates the token; old link dies). */
	copyLink: async (id: string): Promise<string> =>
		(
			await req<{ link: string }>(`/invitations/${id}/copy-link/`, {
				method: "POST",
				headers: await authHeaders(),
			})
		).link,
};
