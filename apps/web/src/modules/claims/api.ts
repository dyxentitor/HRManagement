import { api } from "@/lib/api";

export type ClaimCategory = {
	id: string;
	code: string;
	name: string;
	requires_attachment: boolean;
	currency_code: string;
};

export type ClaimAttachment = {
	id: number;
	filename: string;
	content_type: string;
	size_bytes: number;
	s3_key: string;
	uploaded_at: string;
};

export type ClaimStatus =
	| "draft"
	| "submitted"
	| "manager_approved"
	| "finance_approved"
	| "reimbursed"
	| "rejected"
	| "cancelled";

export type ClaimRequest = {
	id: string;
	employee: string;
	category: string;
	category_code: string;
	amount: string;
	currency_code: string;
	expense_date: string;
	description: string;
	merchant: string;
	status: ClaimStatus;
	current_level: number;
	submitted_at: string | null;
	reimbursed_at: string | null;
	reimbursement_reference: string;
	attachments: ClaimAttachment[];
};

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(`GET ${url} failed`);
	return data as T;
}
async function _post<T>(url: string, body?: unknown): Promise<T> {
	const opts =
		body !== undefined
			? ({ body: body as never } as never)
			: (undefined as never);
	const { data, error } = await api.POST(url as never, opts);
	if (error) throw new Error(`POST ${url} failed`);
	return data as T;
}
function _unwrap<T>(d: { results?: T[] } | T[]): T[] {
	return Array.isArray(d) ? d : d.results || [];
}

export const claimsApi = {
	listCategories: () =>
		_get<{ results?: ClaimCategory[] } | ClaimCategory[]>(
			"/api/v1/claims/categories/",
		).then(_unwrap),
	listMine: () =>
		_get<{ results?: ClaimRequest[] } | ClaimRequest[]>(
			"/api/v1/claims/?scope=self",
		).then(_unwrap),
	listFinanceQueue: () =>
		_get<{ results?: ClaimRequest[] } | ClaimRequest[]>(
			"/api/v1/claims/?scope=finance-queue",
		).then(_unwrap),
	listTeam: () =>
		_get<{ results?: ClaimRequest[] } | ClaimRequest[]>(
			"/api/v1/claims/?scope=team",
		).then(_unwrap),
	retrieve: (id: string) => _get<ClaimRequest>(`/api/v1/claims/${id}/`),
	create: (body: {
		category: string;
		amount: string;
		currency_code: string;
		expense_date: string;
		description: string;
		merchant?: string;
	}) => _post<ClaimRequest>("/api/v1/claims/", body),
	submit: (id: string) => _post<ClaimRequest>(`/api/v1/claims/${id}/submit/`),
	approve: (id: string, comment = "") =>
		_post<ClaimRequest>(`/api/v1/claims/${id}/approve/`, { comment }),
	reject: (id: string, comment: string) =>
		_post<ClaimRequest>(`/api/v1/claims/${id}/reject/`, { comment }),
	cancel: (id: string) => _post<ClaimRequest>(`/api/v1/claims/${id}/cancel/`),
	markReimbursed: (id: string, reference: string) =>
		_post<ClaimRequest>(`/api/v1/claims/${id}/mark-reimbursed/`, { reference }),
	presignedUpload: (claimId: string, filename: string, content_type: string) =>
		_post<{ presigned_url: string; s3_key: string; max_size_bytes: number }>(
			`/api/v1/claims/${claimId}/attachments/presigned-upload/`,
			{ filename, content_type },
		),
	registerAttachment: (
		claimId: string,
		body: {
			filename: string;
			content_type: string;
			size_bytes: number;
			s3_key: string;
		},
	) => _post<ClaimAttachment>(`/api/v1/claims/${claimId}/attachments/`, body),
};
