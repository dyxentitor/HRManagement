import { api } from "@/lib/api";

export type AssignmentType = "task" | "acknowledge";
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
	complete: (assignmentId: string, note = "") =>
		_post<RecipientRow>(`/api/v1/assignments/${assignmentId}/complete/`, { note }),
	list: (status?: AssignmentStatus) =>
		_get<{ results?: AssignmentDef[] } | AssignmentDef[]>(
			`/api/v1/assignments/${status ? `?status=${status}` : ""}`,
		).then(unwrap),
	retrieve: (id: string) => _get<AssignmentDetail>(`/api/v1/assignments/${id}/`),
	create: (body: CreateAssignmentBody) => _post<AssignmentDef>("/api/v1/assignments/", body),
	archive: (id: string) => _post<AssignmentDef>(`/api/v1/assignments/${id}/archive/`),
};
