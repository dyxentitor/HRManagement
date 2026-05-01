import { api } from "@/lib/api";

export type Shift = {
	id: string;
	code: string;
	name: string;
	start_time: string;
	end_time: string;
	crosses_midnight: boolean;
	color: string;
};
export type ShiftAssignment = {
	id: string;
	employee: string;
	employee_code: string;
	shift: string;
	shift_name: string;
	shift_code: string;
	covering_for: string | null;
	covering_for_name: string | null;
	work_date: string;
	status: string;
	published_at: string | null;
	is_published: boolean;
	notes: string;
};
export type Holiday = { id: string; date: string; name: string; type: string };

export interface CalendarEmployee {
	id: string;
	full_name: string;
	employee_code: string;
	status: "active" | "terminated" | "resigned";
	department_name: string | null;
	role_title: string;
	team_id: string | null;
}

export interface CalendarTeam {
	id: string | null;
	name: string;
	sort_order: number;
	min_headcount: number | null;
	parent_team_id: string | null;
	members: CalendarEmployee[];
}

export interface CalendarShift {
	id: string;
	code: string;
	name: string;
	start_time: string;
	end_time: string;
	color: string;
	crosses_midnight: boolean;
}

export interface CalendarAssignment {
	id: string;
	employee_id: string;
	work_date: string;
	shift_id: string;
	shift_code: string;
	covering_for_id: string | null;
	covering_for_name: string | null;
	is_published: boolean;
	notes: string;
}

export interface CalendarLeave {
	employee_id: string;
	date: string;
	type: string;
}

export interface CalendarHoliday {
	date: string;
	name: string;
	type: string;
}

export interface CalendarStats {
	by_day: { date: string; hours: number; headcount: number }[];
	totals: { hours: number; headcount: number };
	coverage: {
		team_id: string;
		team_name: string;
		by_day: { date: string; scheduled: number; min: number; ok: boolean }[];
	}[];
}

export interface CalendarPayload {
	range: { from: string; to: string };
	teams: CalendarTeam[];
	shifts: CalendarShift[];
	assignments: CalendarAssignment[];
	leaves: CalendarLeave[];
	holidays: CalendarHoliday[];
	stats: CalendarStats;
}

export interface BulkFillCell {
	employee_id: string;
	work_date: string;
}

export type BulkFillRule = "leave_overlap" | "overtime" | "coverage_drop";

export interface BulkFillWarning {
	rule: BulkFillRule;
	message: string;
	[key: string]: unknown;
}

export interface BulkFillResult {
	created: number;
	updated: number;
	warnings: BulkFillWarning[];
}

export interface Team {
	id: string;
	name: string;
	parent_team: string | null;
	sort_order: number;
	min_headcount: number | null;
}

// Generic helpers for endpoints whose URL carries query strings or whose
// drf-spectacular schema is too narrow to type cleanly (custom @action
// endpoints, dynamic ?from=…&to=… filters). These deliberately keep the
// `as never` escape hatch — the legacy endpoints below depend on it and
// the cost/benefit of full typed paths there is not worth the churn.
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

export const scheduleApi = {
	myAssignments: (from: string, to: string) =>
		_get<{ results?: ShiftAssignment[] } | ShiftAssignment[]>(
			`/api/v1/schedule/shift-assignments/me/?from=${from}&to=${to}`,
		).then(_unwrap),
	listAssignments: (from: string, to: string) =>
		_get<{ results?: ShiftAssignment[] } | ShiftAssignment[]>(
			`/api/v1/schedule/shift-assignments/?from=${from}&to=${to}`,
		).then(_unwrap),
	listShifts: () =>
		_get<{ results?: Shift[] } | Shift[]>("/api/v1/schedule/shifts/").then(
			_unwrap,
		),
	listHolidays: (year: number) =>
		_get<{ results?: Holiday[] } | Holiday[]>(
			`/api/v1/schedule/holidays/?year=${year}`,
		).then(_unwrap),
	bulkAssign: (body: {
		employee_ids: string[];
		pattern: Record<string, string>;
		date_from: string;
		date_to: string;
		notes?: string;
	}) => _post("/api/v1/schedule/shift-assignments/bulk-pattern/", body),
	publish: (date_from: string, date_to: string) =>
		_post<{ published: number }>(
			"/api/v1/schedule/shift-assignments/publish/",
			{ date_from, date_to },
		),
	// Calendar endpoint: spectacular emits `query?: never` for this @action,
	// so we cannot pass typed query params; fall back to manual querystring +
	// the generic helper. Path itself is in the OpenAPI spec.
	calendar: (params: {
		from: string;
		to: string;
		team_id?: string;
		department_id?: string;
		q?: string;
		include_inactive?: boolean;
	}) => {
		const qs = new URLSearchParams();
		qs.set("from", params.from);
		qs.set("to", params.to);
		if (params.team_id) qs.set("team_id", params.team_id);
		if (params.department_id) qs.set("department_id", params.department_id);
		if (params.q) qs.set("q", params.q);
		if (params.include_inactive) qs.set("include_inactive", "true");
		return _get<CalendarPayload>(
			`/api/v1/schedule/shift-assignments/calendar/?${qs.toString()}`,
		);
	},
	// Bulk-fill: typed path, but spectacular emits the wrong body shape
	// (ShiftAssignmentRequest fallback for an @action endpoint). Body is
	// cast at the call site; response is decoded via `as`.
	bulkFill: async (body: {
		cells: BulkFillCell[];
		shift_id: string;
		notes?: string;
	}): Promise<BulkFillResult> => {
		const { data, error } = await api.POST(
			"/api/v1/schedule/shift-assignments/bulk-fill/",
			{ body: body as never },
		);
		if (error || !data) throw new Error("bulk-fill failed");
		return data as unknown as BulkFillResult;
	},
	// Cover-up: typed path + path param `id`. Body is the wrong fallback
	// shape so we cast at the call site.
	coverUp: async (
		assignmentId: string,
		coveringForId: string | null,
	): Promise<CalendarAssignment> => {
		const { data, error } = await api.PATCH(
			"/api/v1/schedule/shift-assignments/{id}/cover-up/",
			{
				params: { path: { id: assignmentId } },
				body: { covering_for_id: coveringForId } as never,
			},
		);
		if (error || !data) throw new Error("cover-up failed");
		return data as unknown as CalendarAssignment;
	},
	// Delete: typed path + path param `id`.
	deleteAssignment: async (id: string): Promise<void> => {
		const { error } = await api.DELETE(
			"/api/v1/schedule/shift-assignments/{id}/",
			{ params: { path: { id } } },
		);
		if (error) throw new Error(`DELETE shift-assignment ${id} failed`);
	},
};

export const teamApi = {
	// Typed path. Spectacular models the response as Team[] directly (not paginated),
	// so we still pass through `_unwrap` for safety in case pagination is enabled.
	list: async (): Promise<Team[]> => {
		const { data, error } = await api.GET("/api/v1/teams/");
		if (error) throw new Error("GET /api/v1/teams/ failed");
		return _unwrap(data as unknown as { results?: Team[] } | Team[]);
	},
};
