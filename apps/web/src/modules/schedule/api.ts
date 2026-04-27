import { api } from "@/lib/api";

export type Shift = {
	id: string;
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
	work_date: string;
	status: string;
	published_at: string | null;
	is_published: boolean;
	notes: string;
};
export type Holiday = { id: string; date: string; name: string; type: string };

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
};
