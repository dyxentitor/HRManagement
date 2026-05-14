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
		if (typeof first.message === "string" && first.message)
			return first.message;
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

export const leaveApi = {
	listTypes: () =>
		_get<{ results?: LeaveType[] } | LeaveType[]>("/api/v1/leave/types/").then(
			(d) => (Array.isArray(d) ? d : d.results || []),
		),
	myBalances: () => _get<LeaveBalance[]>("/api/v1/leave/balances/me/"),
	listMyRequests: () =>
		_get<{ results?: LeaveRequest[] } | LeaveRequest[]>(
			"/api/v1/leave/requests/?scope=self",
		).then((d) => (Array.isArray(d) ? d : d.results || [])),
	listTeamRequests: () =>
		_get<{ results?: LeaveRequest[] } | LeaveRequest[]>(
			"/api/v1/leave/requests/?scope=team",
		).then((d) => (Array.isArray(d) ? d : d.results || [])),
	apply: (body: {
		leave_type: string;
		start_date: string;
		end_date: string;
		total_days: string;
		is_half_day: boolean;
		half_day_period?: string;
		reason: string;
	}) => _post<LeaveRequest>("/api/v1/leave/requests/", body),
	submit: (id: string) =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/submit/`),
	approve: (id: string, comment = "") =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/approve/`, { comment }),
	reject: (id: string, comment: string) =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/reject/`, { comment }),
	cancel: (id: string) =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/cancel/`),
	withdraw: (id: string) =>
		_post<LeaveRequest>(`/api/v1/leave/requests/${id}/withdraw/`),
};
