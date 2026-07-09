import { api } from "@/lib/api";

export type LeaveType = {
	id: string;
	code: string;
	name: string;
	is_paid: boolean;
	is_statutory: boolean;
};

export type LeaveLedgerEntry = {
	ts: string;
	delta: string;
	reason: string;
	reference_type: string | null;
};

export type LeaveBalance = {
	id: string;
	leave_type: string;
	leave_type_code: string;
	leave_type_name?: string;
	year: number;
	entitled: string;
	accrued: string;
	taken: string;
	pending: string;
	carried_forward: string;
	carried_forward_expires_at?: string | null;
	available: string;
	ledger_recent?: LeaveLedgerEntry[];
};

export type LeaveOverride = {
	id: string;
	leave_type: string;
	days_override: string;
	effective_from: string;
	effective_to?: string | null;
	note?: string;
};

export type LeaveRequestStatus =
	| "draft"
	| "submitted"
	| "approved"
	| "rejected"
	| "cancelled"
	| "withdrawn";

export type LeaveRequest = {
	id: string;
	employee_id: string;
	leave_type: string;
	leave_type_code: string;
	start_date: string;
	end_date: string;
	total_days: string;
	is_half_day: boolean;
	half_day_period: string;
	reason: string;
	status: LeaveRequestStatus;
	current_level: number;
	submitted_at: string | null;
	decided_at: string | null;
};

export type Holiday = { date: string; name: string; type: string };

/** A row in the Leave Approvals workspace — structurally an approvals InboxItem
 * plus the queue decision flags. */
export type LeaveApprovalRow = {
	kind: "leave";
	id: string;
	employee_id: string;
	employee_code: string;
	name: string;
	department: string;
	type_code: string;
	summary: string;
	deep_link: string;
	submitted_at: string | null;
	detail: Record<string, unknown>;
	status: string;
	actionable: boolean;
	age_days: number;
	is_overdue: boolean;
	is_conflict: boolean;
};

export type LeaveApprovalSummary = {
	awaiting_count: number;
	overdue_count: number;
	conflict_count: number;
	oldest_days: number;
	approved_this_week: number;
	rejected_this_week: number;
};

export type CoveragePerson = {
	employee_id: string;
	name: string;
	leave_type_code: string;
	start: string;
	end: string;
	status: string;
};
export type Coverage = {
	team_size: number;
	per_day: Record<string, number>;
	people: CoveragePerson[];
};

/**
 * Pull a user-readable message out of an RFC 7807 problem detail body.
 * Backend shape (see common/exception_handler.py):
 *   { type, title, status, detail, errors?: [{field, code, message}] }
 */
function _errorMessage(error: unknown, fallback: string): string {
	if (!error || typeof error !== "object") return fallback;
	const e = error as Record<string, unknown>;
	const errs = e.errors;
	if (Array.isArray(errs) && errs.length > 0) {
		const first = errs[0] as Record<string, unknown>;
		if (typeof first.message === "string" && first.message) return first.message;
	}
	if (typeof e.detail === "string" && e.detail) return e.detail;
	if (typeof e.title === "string" && e.title) return e.title;
	return fallback;
}

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(_errorMessage(error, `GET ${url} failed`));
	return data as T;
}

async function _post<T>(url: string, body?: unknown): Promise<T> {
	// Cast opts entirely to avoid openapi-fetch path-specific type constraints
	const opts = (body ? { body } : undefined) as never;
	const { data, error } = await api.POST(url as never, opts);
	if (error) throw new Error(_errorMessage(error, `POST ${url} failed`));
	return data as T;
}

async function _delete(url: string): Promise<void> {
	const { error } = await api.DELETE(url as never);
	if (error) throw new Error(_errorMessage(error, `DELETE ${url} failed`));
}

async function _patch<T>(url: string, body: unknown): Promise<T> {
	const { data, error } = await api.PATCH(url as never, { body } as never);
	if (error) throw new Error(_errorMessage(error, `PATCH ${url} failed`));
	return data as T;
}

export interface EntitlementPreviewItem {
	leave_type_id: string;
	code: string;
	name: string;
	accrual_type: string;
	days_per_year: string;
	prorated_days: string;
}

export interface EntitlementPreviewResult {
	year: number;
	items: EntitlementPreviewItem[];
}

export async function entitlementPreview(params: {
	hire_date: string;
	department?: string;
}): Promise<EntitlementPreviewResult> {
	const qs = new URLSearchParams({ hire_date: params.hire_date });
	if (params.department) qs.set("department", params.department);
	return _get<EntitlementPreviewResult>(`/api/v1/leave/entitlement-preview/?${qs.toString()}`);
}

export type LeaveAdjustment = {
	ts: string;
	leave_type: string;
	delta: string;
	before: string;
	after: string;
	note: string;
	performed_by: string;
};

export const leaveApi = {
	listTypes: () =>
		_get<{ results?: LeaveType[] } | LeaveType[]>("/api/v1/leave/types/").then((d) =>
			Array.isArray(d) ? d : d.results || [],
		),
	myBalances: () => _get<LeaveBalance[]>("/api/v1/leave/balances/me/"),
	// Per-employee balance/overrides (HR + scoped read) — v1.28.0.
	balancesFor: (employeeId: string) =>
		_get<LeaveBalance[]>(`/api/v1/leave/balances/?employee=${employeeId}`),
	overridesFor: (employeeId: string) =>
		_get<{ results?: LeaveOverride[] } | LeaveOverride[]>(
			`/api/v1/leave/employee-overrides/?employee=${employeeId}`,
		).then((d) => (Array.isArray(d) ? d : d.results || [])),
	createOverride: (
		employeeId: string,
		body: {
			leave_type: string;
			days_override: string;
			effective_from: string;
			effective_to?: string | null;
			note?: string;
		},
	) => _post<LeaveOverride>(`/api/v1/leave/employee-overrides/?employee=${employeeId}`, body),
	updateOverride: (
		id: string,
		body: {
			days_override: string;
			effective_from: string;
			effective_to?: string | null;
			note?: string;
		},
	) => _patch<LeaveOverride>(`/api/v1/leave/employee-overrides/${id}/`, body),
	deleteOverride: (id: string) => _delete(`/api/v1/leave/employee-overrides/${id}/`),
	adjustmentHistory: (employeeId: string) =>
		_get<LeaveAdjustment[]>(`/api/v1/leave/balances/history/?employee=${employeeId}`),
	adjustBalance: (body: {
		employee_id: string;
		leave_type_id: string;
		delta: string;
		note: string;
	}) => _post<LeaveBalance>("/api/v1/leave/balances/adjust/", body),
	holidays: (year?: number) =>
		_get<{ results?: Holiday[] } | Holiday[]>(
			`/api/v1/schedule/holidays/${year ? `?year=${year}` : ""}`,
		).then((d) => (Array.isArray(d) ? d : d.results || [])),
	coverage: (start: string, end: string, employeeId?: string) => {
		const qs = new URLSearchParams({ start, end });
		if (employeeId) qs.set("employee_id", employeeId);
		return _get<Coverage>(`/api/v1/leave/coverage?${qs.toString()}`);
	},
	listMyRequests: () =>
		_get<{ results?: LeaveRequest[] } | LeaveRequest[]>("/api/v1/leave/requests/?scope=self").then(
			(d) => (Array.isArray(d) ? d : d.results || []),
		),
	listTeamRequests: () =>
		_get<{ results?: LeaveRequest[] } | LeaveRequest[]>("/api/v1/leave/requests/?scope=team").then(
			(d) => (Array.isArray(d) ? d : d.results || []),
		),
	apply: (body: {
		leave_type: string;
		start_date: string;
		end_date: string;
		total_days: string;
		is_half_day: boolean;
		half_day_period?: string;
		reason: string;
	}) => _post<LeaveRequest>("/api/v1/leave/requests/", body),
	submit: (id: string) => _post<LeaveRequest>(`/api/v1/leave/requests/${id}/submit/`),
	approve: (id: string, comment = "") =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/approve/`, { comment }),
	reject: (id: string, comment: string) =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/reject/`, { comment }),
	cancel: (id: string) => _post<LeaveRequest>(`/api/v1/leave/requests/${id}/cancel/`),
	withdraw: (id: string) => _post<LeaveRequest>(`/api/v1/leave/requests/${id}/withdraw/`),
	// Approver workspace — tabbed history + summary (v1.63.0).
	approvalsQueue: (tab: string) =>
		_get<LeaveApprovalRow[]>(`/api/v1/leave/requests/approvals/?tab=${tab}`),
	approvalsSummary: () =>
		_get<LeaveApprovalSummary>("/api/v1/leave/requests/approvals/summary/"),
};
