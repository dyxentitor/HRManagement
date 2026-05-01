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
async function _patch<T>(url: string, body: unknown): Promise<T> {
	const { data, error } = await api.PATCH(url as never, { body } as never);
	if (error) throw new Error(`PATCH ${url} failed`);
	return data as T;
}
async function _delete(url: string): Promise<void> {
	const { error } = await api.DELETE(url as never);
	if (error) throw new Error(`DELETE ${url} failed`);
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
	bulkFill: (body: {
		cells: BulkFillCell[];
		shift_id: string;
		notes?: string;
	}) =>
		_post<BulkFillResult>(
			"/api/v1/schedule/shift-assignments/bulk-fill/",
			body,
		),
	coverUp: (assignmentId: string, coveringForId: string | null) =>
		_patch<CalendarAssignment>(
			`/api/v1/schedule/shift-assignments/${assignmentId}/cover-up/`,
			{ covering_for_id: coveringForId },
		),
	deleteAssignment: (id: string) =>
		_delete(`/api/v1/schedule/shift-assignments/${id}/`),
};

export const teamApi = {
	list: () =>
		_get<{ results?: Team[] } | Team[]>("/api/v1/teams/").then(_unwrap),
};
