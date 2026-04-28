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

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
		this.name = "ApiError";
	}
}

async function _get<T>(url: string): Promise<T> {
	const result = (await api.GET(url as never)) as {
		data?: unknown;
		error?: unknown;
		response: Response;
	};
	if (result.error)
		throw new ApiError(`GET ${url} failed`, result.response?.status ?? 0);
	return result.data as T;
}
async function _post<T>(url: string): Promise<T> {
	const result = (await api.POST(url as never, undefined as never)) as {
		data?: unknown;
		error?: unknown;
		response: Response;
	};
	if (result.error)
		throw new ApiError(`POST ${url} failed`, result.response?.status ?? 0);
	return result.data as T;
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
