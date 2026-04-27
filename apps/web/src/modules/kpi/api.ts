import { api } from "@/lib/api";

export type KpiTemplate = {
	id: string;
	name: string;
	description: string;
	applies_to_role_id: string | null;
	applies_to_dept_id: string | null;
	definitions: KpiDefinition[];
};

export type KpiDefinition = {
	id: number;
	code: string;
	name: string;
	description: string;
	metric_type: "numeric" | "percentage" | "rating" | "boolean";
	target: string | null;
	unit: string;
	weight: string;
	evidence_required: boolean;
	sort_order: number;
};

export type KpiCycleStatus =
	| "upcoming"
	| "self_review"
	| "manager_review"
	| "closed";

export type KpiCycle = {
	id: string;
	name: string;
	type: "quarterly" | "semi_annual" | "annual";
	starts_on: string;
	ends_on: string;
	review_opens_on: string;
	review_closes_on: string;
	status: KpiCycleStatus;
};

export type KpiAssignmentStatus =
	| "pending"
	| "self_done"
	| "manager_done"
	| "closed";

export type KpiAssignment = {
	id: string;
	cycle: string;
	employee_id: string;
	template: string;
	kpis: KpiDefinition[];
	status: KpiAssignmentStatus;
};

export type KpiReview = {
	id: number;
	assignment: string;
	stage: "self" | "manager" | "final";
	iteration: number;
	scores: Record<string, { score: number; comment?: string }>;
	overall_comment: string;
	evidence: string[];
	submitted_by: string;
	submitted_at: string;
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

export const kpiApi = {
	listTemplates: () => _get<KpiTemplate[]>("/api/v1/kpi/templates/"),

	listCycles: () => _get<KpiCycle[]>("/api/v1/kpi/cycles/"),

	createCycle: (payload: Omit<KpiCycle, "id" | "status">) =>
		_post<KpiCycle>("/api/v1/kpi/cycles/", payload),

	openSelfReview: (cycleId: string) =>
		_post<KpiCycle>(`/api/v1/kpi/cycles/${cycleId}/open-self-review/`, {}),

	openManagerReview: (cycleId: string) =>
		_post<KpiCycle>(`/api/v1/kpi/cycles/${cycleId}/open-manager-review/`, {}),

	closeCycle: (cycleId: string) =>
		_post<KpiCycle>(`/api/v1/kpi/cycles/${cycleId}/close/`, {}),

	myAssignments: (cycleId?: string) =>
		_get<KpiAssignment[]>(
			cycleId
				? `/api/v1/kpi/assignments/me/?cycle_id=${cycleId}`
				: "/api/v1/kpi/assignments/me/",
		),

	teamAssignments: (cycleId?: string) =>
		_get<KpiAssignment[]>(
			cycleId
				? `/api/v1/kpi/assignments/?cycle_id=${cycleId}`
				: "/api/v1/kpi/assignments/",
		),

	bulkAssign: (payload: {
		cycle_id: string;
		template_id: string;
		employee_ids: string[];
	}) => _post<{ created: number }>("/api/v1/kpi/assignments/", payload),

	submitSelf: (
		assignmentId: string,
		payload: { scores: Record<string, unknown>; overall_comment: string },
	) => _post<KpiReview>(`/api/v1/kpi/reviews/${assignmentId}/self/`, payload),

	submitManager: (
		assignmentId: string,
		payload: { scores: Record<string, unknown>; overall_comment: string },
	) =>
		_post<KpiReview>(`/api/v1/kpi/reviews/${assignmentId}/manager/`, payload),
};
