import { api } from "@/lib/api";

export type AttendanceRecord = {
	id?: string;
	work_date?: string;
	clock_in: string | null;
	clock_out: string | null;
	status: string;
	computed_hours?: number | null;
	is_holiday_work?: boolean;
};

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(`GET ${url} failed`);
	return data as T;
}
async function _post<T>(url: string): Promise<T> {
	const { data, error } = await api.POST(url as never, undefined as never);
	if (error) throw new Error(`POST ${url} failed`);
	return data as T;
}

export const attendanceApi = {
	today: () => _get<AttendanceRecord>("/api/v1/attendance/today/"),
	clockIn: () => _post<AttendanceRecord>("/api/v1/attendance/clock-in/"),
	clockOut: () => _post<AttendanceRecord>("/api/v1/attendance/clock-out/"),
	records: (from?: string, to?: string) => {
		const qs = new URLSearchParams();
		if (from) qs.set("from", from);
		if (to) qs.set("to", to);
		return _get<AttendanceRecord[]>(
			`/api/v1/attendance/records/?${qs.toString()}`,
		);
	},
};
