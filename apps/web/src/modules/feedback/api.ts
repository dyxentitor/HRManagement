import { api } from "@/lib/api";

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
function _unwrap<T>(d: { results?: T[] } | T[]): T[] {
	return Array.isArray(d) ? d : d.results || [];
}

export const feedbackApi = {
	listMine: () =>
		_get<{ results?: FeedbackItem[] } | FeedbackItem[]>("/api/v1/feedback/?scope=self").then(
			_unwrap,
		),
	get: (id: string) => _get<FeedbackItem>(`/api/v1/feedback/${id}/`),
	create: (body: {
		category: FeedbackCategory;
		title: string;
		description: string;
		affected_module?: string;
	}) => _post<FeedbackItem>("/api/v1/feedback/", body),
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
