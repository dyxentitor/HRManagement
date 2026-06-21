import { api } from "@/lib/api";

const CERT_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function certAuthHeaders(
	extra: Record<string, string> = {},
): Promise<Record<string, string>> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export type CertStatus = "active" | "expired" | "revoked";

export type Certification = {
	id: string;
	employee_id: string;
	name: string;
	issuer: string;
	certificate_number: string;
	issued_on: string;
	expires_on: string | null;
	document_s3_key: string;
	status: CertStatus;
	reminder_sent_30d: boolean;
	reminder_sent_60d: boolean;
	reminder_sent_90d: boolean;
	created_at: string;
	updated_at: string;
};

export type TrainingPlan = {
	id: string;
	name: string;
	description: string;
	required_for_role_id: string | null;
	required_for_dept_id: string | null;
	created_at: string;
	updated_at: string;
};

export type TrainingAssignmentStatus = "assigned" | "in_progress" | "completed" | "overdue";

export type TrainingProgress = {
	id: number;
	assignment: string;
	progress_pct: string;
	notes: string;
	ts: string;
};

export type TrainingAssignment = {
	id: string;
	plan: string;
	plan_name: string;
	employee_id: string;
	assigned_by: string;
	due_date: string;
	status: TrainingAssignmentStatus;
	completed_at: string | null;
	evidence_s3_key: string;
	progress: TrainingProgress[];
	created_at: string;
	updated_at: string;
};

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(`GET ${url} failed`);
	return data as T;
}

async function _post<T>(url: string, body?: unknown): Promise<T> {
	const opts = body !== undefined ? { body: body as never } : undefined;
	const { data, error } = await api.POST(url as never, opts as never);
	if (error) throw new Error(`POST ${url} failed`);
	return data as T;
}

export const certificationApi = {
	myCertifications: () => _get<Certification[]>("/api/v1/certifications/me/"),

	listCertifications: (params?: {
		employee_id?: string;
		expiring_within_days?: number;
	}) => {
		const qs = new URLSearchParams();
		if (params?.employee_id) qs.set("employee_id", params.employee_id);
		if (params?.expiring_within_days !== undefined)
			qs.set("expiring_within_days", String(params.expiring_within_days));
		const query = qs.toString();
		return _get<Certification[]>(
			query ? `/api/v1/certifications/?${query}` : "/api/v1/certifications/",
		);
	},

	createCertification: (payload: {
		name: string;
		issuer?: string;
		certificate_number?: string;
		issued_on: string;
		expires_on?: string;
		// employee_id is derived server-side from the signed-in user's Employee.
	}) => _post<Certification>("/api/v1/certifications/", payload),

	myAssignments: () => _get<TrainingAssignment[]>("/api/v1/training/assignments/me/"),

	listAssignments: (params?: { status?: string }) => {
		const qs = new URLSearchParams();
		if (params?.status) qs.set("status", params.status);
		const query = qs.toString();
		return _get<TrainingAssignment[]>(
			query ? `/api/v1/training/assignments/?${query}` : "/api/v1/training/assignments/",
		);
	},

	listPlans: () => _get<TrainingPlan[]>("/api/v1/training/plans/"),

	createPlan: (payload: { name: string; description?: string }) =>
		_post<TrainingPlan>("/api/v1/training/plans/", payload),

	completeAssignment: (id: string, s3Key = "") =>
		_post<TrainingAssignment>(`/api/v1/training/assignments/${id}/complete/`, {
			s3_key: s3Key,
		}),

	addProgress: (payload: {
		assignment: string;
		progress_pct: number;
		notes?: string;
	}) => _post<TrainingProgress>("/api/v1/training/progress/", payload),

	/** Presigned GET to view/download a cert's uploaded document. */
	downloadDocument: async (certId: string): Promise<{ url: string; filename: string }> => {
		const resp = await fetch(
			`${CERT_BASE_URL}/api/v1/certifications/${certId}/document/download/`,
			{ headers: await certAuthHeaders() },
		);
		if (!resp.ok) throw new Error("Could not open the document");
		return (await resp.json()) as { url: string; filename: string };
	},

	/** Upload a document (image/pdf) to an existing cert: presign → S3 PUT → register. */
	uploadCertificationDocument: async (certId: string, file: File): Promise<Certification> => {
		const authJson = await certAuthHeaders({ "Content-Type": "application/json" });

		const presignResp = await fetch(
			`${CERT_BASE_URL}/api/v1/certifications/${certId}/document/presigned-upload/`,
			{ method: "POST", headers: authJson, body: JSON.stringify({ content_type: file.type }) },
		);
		if (!presignResp.ok) throw new Error("Could not start the upload");
		const { upload_url, s3_key } = (await presignResp.json()) as {
			upload_url: string;
			s3_key: string;
		};

		const putResp = await fetch(upload_url, {
			method: "PUT",
			headers: { "Content-Type": file.type },
			body: file,
		});
		if (!putResp.ok) throw new Error("Upload to storage failed");

		const regResp = await fetch(`${CERT_BASE_URL}/api/v1/certifications/${certId}/document/`, {
			method: "POST",
			headers: authJson,
			body: JSON.stringify({ s3_key }),
		});
		if (!regResp.ok) throw new Error("Could not save the document");
		return (await regResp.json()) as Certification;
	},
};
