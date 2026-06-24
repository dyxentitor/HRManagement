import { api } from "@/lib/api";

export type AssignmentType = "task" | "acknowledge" | "questionnaire";
export type QuestionType = "single_choice" | "multi_choice" | "short_text" | "rating";

export interface Question {
	id: string;
	order: number;
	text: string;
	qtype: QuestionType;
	options: string[];
	required: boolean;
}
export interface QuestionnairePayload {
	assignment: AssignmentDef;
	questions: Question[];
	completed: boolean;
}
export type QuestionDraft = {
	text: string;
	qtype: QuestionType;
	options: string[];
	required: boolean;
};
export type ResponseAggregate =
	| {
			id: string;
			text: string;
			qtype: "single_choice" | "multi_choice";
			counts: Record<string, number>;
			total: number;
	  }
	| { id: string; text: string; qtype: "short_text" | "rating"; answers: unknown[] };
export interface Analytics {
	totals: {
		total: number;
		completed: number;
		overdue: number;
		pending: number;
		completion_rate: number;
	};
	by_department: { department: string; total: number; completed: number; overdue: number }[];
	by_type: { type: string; total: number; completed: number }[];
}
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type CompleteOn = "manual" | "profile_completed" | "leave_requested";
export type AssignmentStatus = "draft" | "published" | "archived";
export type RecipientStatus = "pending" | "completed";
export type EffectiveStatus = "pending" | "completed" | "overdue";
export type LinkTarget = "none" | "internal" | "external";

export interface AssignmentDef {
	id: string;
	title: string;
	description: string;
	type: AssignmentType;
	link_url: string;
	link_target: LinkTarget;
	default_due_date: string | null;
	status: AssignmentStatus;
	created_at: string;
	complete_on?: CompleteOn;
	requires_evidence?: boolean;
	version?: number;
	recurrence?: Recurrence;
	recurrence_interval?: number;
	recurrence_until?: string | null;
	is_template?: boolean;
	next_run_at?: string | null;
}

export interface RecipientRow {
	id: string;
	assignment: AssignmentDef;
	due_date: string | null;
	status: RecipientStatus;
	effective_status: EffectiveStatus;
	completed_at: string | null;
	note: string;
	created_at: string;
}

export interface AssignmentDetail extends AssignmentDef {
	summary: { total: number; done: number; overdue: number };
	recipients: {
		id: string;
		employee_id?: string;
		employee_name?: string;
		employee_code?: string;
		due_date: string | null;
		status: RecipientStatus;
		effective_status: EffectiveStatus;
		completed_at: string | null;
	}[];
}

export interface CreateAssignmentBody {
	title: string;
	description?: string;
	type: AssignmentType;
	link_url?: string;
	link_target?: LinkTarget;
	default_due_date?: string | null;
	target: { kind: "employee" | "team" | "department" | "org"; ids: string[] };
	publish?: boolean;
	questions?: QuestionDraft[];
	complete_on?: CompleteOn;
	requires_evidence?: boolean;
	recurrence?: Recurrence;
	recurrence_interval?: number;
	recurrence_until?: string | null;
}

function _msg(error: unknown, fallback: string): string {
	if (error && typeof error === "object") {
		const e = error as { detail?: unknown; errors?: Array<{ message?: unknown }> };
		if (typeof e.detail === "string" && e.detail) return e.detail;
		const first = e.errors?.[0]?.message;
		if (typeof first === "string" && first) return first;
	}
	return fallback;
}

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(_msg(error, `GET ${url} failed`));
	return data as T;
}
async function _post<T>(url: string, body?: unknown): Promise<T> {
	const { data, error } = await api.POST(url as never, (body ? { body } : undefined) as never);
	if (error) throw new Error(_msg(error, `POST ${url} failed`));
	return data as T;
}

const unwrap = <T>(d: { results?: T[] } | T[]): T[] => (Array.isArray(d) ? d : (d.results ?? []));

export const assignmentsApi = {
	myAssignments: () => _get<RecipientRow[]>("/api/v1/assignments/me/"),
	complete: (assignmentId: string, note = "", evidenceS3Key = "") =>
		_post<RecipientRow>(`/api/v1/assignments/${assignmentId}/complete/`, {
			note,
			evidence_s3_key: evidenceS3Key,
		}),
	evidenceUrl: (assignmentId: string, contentType: string) =>
		_post<{ url: string; key: string }>(`/api/v1/assignments/${assignmentId}/evidence-url/`, {
			content_type: contentType,
		}),
	revise: (id: string) =>
		_post<{ version: number; reopened: number }>(`/api/v1/assignments/${id}/revise/`),
	list: (status?: AssignmentStatus) =>
		_get<{ results?: AssignmentDef[] } | AssignmentDef[]>(
			`/api/v1/assignments/${status ? `?status=${status}` : ""}`,
		).then(unwrap),
	retrieve: (id: string) => _get<AssignmentDetail>(`/api/v1/assignments/${id}/`),
	create: (body: CreateAssignmentBody) => _post<AssignmentDef>("/api/v1/assignments/", body),
	archive: (id: string) => _post<AssignmentDef>(`/api/v1/assignments/${id}/archive/`),
	questionnaire: (id: string) =>
		_get<QuestionnairePayload>(`/api/v1/assignments/${id}/questionnaire/`),
	submit: (id: string, answers: Record<string, unknown>) =>
		_post<RecipientRow>(`/api/v1/assignments/${id}/submit/`, { answers }),
	responses: (id: string) => _get<ResponseAggregate[]>(`/api/v1/assignments/${id}/responses/`),
	analytics: () => _get<Analytics>("/api/v1/assignments/analytics/"),
};
