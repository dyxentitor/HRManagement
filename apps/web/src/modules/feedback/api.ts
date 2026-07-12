import { api } from "@/lib/api";
import { tokenStorage } from "@/lib/token-storage";

export type FeedbackCategory =
	| "bug"
	| "feature"
	| "improvement"
	| "uiux"
	| "performance"
	| "security"
	| "documentation"
	| "general";

export type FeedbackStatus = "new" | "in_review" | "resolved" | "closed";

export type FeedbackAttachment = {
	id: number;
	filename: string;
	content_type: string;
	size_bytes: number;
	s3_key: string;
	uploaded_at: string;
};

export type FeedbackItem = {
	id: string;
	category: FeedbackCategory;
	title: string;
	description: string;
	affected_module: string | null;
	status: FeedbackStatus;
	created_at: string;
	updated_at: string;
	attachments?: FeedbackAttachment[];
	// Admin-only fields (present when scope=org)
	assignee_id?: string | null;
	assignee_name?: string | null;
	reporter_email?: string | null;
	notes?: FeedbackNote[];
};

export type FeedbackNote = {
	id: number;
	body: string;
	author_email: string;
	created_at: string;
};

export type AdminUser = {
	id: string;
	email: string;
	role_codes: string[];
};

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(`GET ${url} failed`);
	return data as T;
}
async function _post<T>(url: string, body?: unknown): Promise<T> {
	const opts = body !== undefined ? ({ body: body as never } as never) : (undefined as never);
	const { data, error } = await api.POST(url as never, opts);
	if (error) throw new Error(`POST ${url} failed`);
	return data as T;
}
async function _patch<T>(url: string, body: unknown): Promise<T> {
	const token = tokenStorage.getAccess();
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers["Authorization"] = `Bearer ${token}`;
	const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "";
	const res = await fetch(`${BASE_URL}${url}`, {
		method: "PATCH",
		headers,
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
		const msgs = payload?.errors as Array<{ message: string }> | undefined;
		throw new Error(msgs?.[0]?.message ?? (payload?.detail as string | undefined) ?? `PATCH ${url} failed`);
	}
	return res.json() as Promise<T>;
}
function _unwrap<T>(d: { results?: T[] } | T[]): T[] {
	return Array.isArray(d) ? d : d.results || [];
}

export const feedbackApi = {
	listMine: () =>
		_get<{ results?: FeedbackItem[] } | FeedbackItem[]>("/api/v1/feedback/?scope=self").then(
			_unwrap,
		),
	/** Admin: list all feedback for the org with optional filters */
	listAll: (params: { status?: string; category?: string; q?: string; assignee?: string } = {}) => {
		const qs = new URLSearchParams({ scope: "org" });
		if (params.status) qs.set("status", params.status);
		if (params.category) qs.set("category", params.category);
		if (params.q) qs.set("q", params.q);
		if (params.assignee) qs.set("assignee", params.assignee);
		return _get<{ results?: FeedbackItem[] } | FeedbackItem[]>(
			`/api/v1/feedback/?${qs.toString()}`,
		).then(_unwrap);
	},
	get: (id: string) => _get<FeedbackItem>(`/api/v1/feedback/${id}/`),
	create: (body: {
		category: FeedbackCategory;
		title: string;
		description: string;
		affected_module?: string;
	}) => _post<FeedbackItem>("/api/v1/feedback/", body),
	/** Admin: update status or assignee */
	updateStatus: (id: string, status: FeedbackStatus) =>
		_patch<FeedbackItem>(`/api/v1/feedback/${id}/`, { status }),
	/** Admin: assign to another admin (null to unassign) */
	assign: (id: string, assigneeId: string | null) =>
		_patch<FeedbackItem>(`/api/v1/feedback/${id}/`, { assignee_id: assigneeId }),
	/** Admin: list internal notes */
	listNotes: (id: string) =>
		_get<{ results?: FeedbackNote[] } | FeedbackNote[]>(
			`/api/v1/feedback/${id}/notes/`,
		).then(_unwrap),
	/** Admin: add an internal note */
	addNote: (id: string, body: string) =>
		_post<FeedbackNote>(`/api/v1/feedback/${id}/notes/`, { body }),
	/**
	 * Admin: list available assignees.
	 * Uses /api/v1/users/?status=active and filters to org_admin role client-side.
	 * Falls back to an empty list if the caller lacks user:read:org perm.
	 */
	listAdmins: async (): Promise<AdminUser[]> => {
		const token = tokenStorage.getAccess();
		const headers: Record<string, string> = {};
		if (token) headers["Authorization"] = `Bearer ${token}`;
		const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "";
		try {
			const res = await fetch(`${BASE_URL}/api/v1/users/?status=active`, { headers });
			if (!res.ok) return [];
			const data = await res.json() as AdminUser[] | { results?: AdminUser[] };
			const list = Array.isArray(data) ? data : data.results ?? [];
			return list.filter((u) => u.role_codes.includes("org_admin"));
		} catch {
			return [];
		}
	},
	presignedUpload: (
		feedbackId: string,
		body: { filename: string; content_type: string },
	) =>
		_post<{ presigned_url: string; s3_key: string; max_size_bytes: number }>(
			`/api/v1/feedback/${feedbackId}/attachments/presigned-upload/`,
			body,
		),
	registerAttachment: (
		feedbackId: string,
		body: {
			filename: string;
			content_type: string;
			size_bytes: number;
			s3_key: string;
		},
	) => _post<FeedbackAttachment>(`/api/v1/feedback/${feedbackId}/attachments/`, body),
	downloadAttachment: (feedbackId: string, attachmentId: number | string) =>
		_get<{ url: string; filename: string }>(
			`/api/v1/feedback/${feedbackId}/attachments/${attachmentId}/download/`,
		),
};
