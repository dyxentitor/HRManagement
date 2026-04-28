import { api } from "@/lib/api";

export type ReportColumn = {
	field: string;
	label: string;
	type?: string;
};

export type ReportFilter = {
	field: string;
	type: "date" | "text" | "number" | "select";
	label: string;
	options?: string[];
};

export type ReportSummary = {
	code: string;
	title: string;
	exporters: string[];
};

export type ReportSchema = {
	code: string;
	title: string;
	columns: ReportColumn[];
	filters: ReportFilter[];
	exporters: string[];
	permissions: string[];
};

export type ReportRunResult = {
	code: string;
	total: number;
	page: number;
	page_size: number;
	columns: ReportColumn[];
	rows: Record<string, string | null>[];
};

export type ExportJob = {
	id: number;
	report_code: string;
	format: string;
	status: "pending" | "running" | "done" | "failed";
	s3_key: string;
	error: string;
	created_at: string;
	completed_at: string | null;
	download_url?: string;
};

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
async function _delete(url: string): Promise<void> {
	const { error } = await api.DELETE(url as never);
	if (error) throw new Error(`DELETE ${url} failed`);
}

export const reportsApi = {
	list: () => _get<ReportSummary[]>("/api/v1/reports"),

	schema: (code: string) =>
		_get<ReportSchema>(`/api/v1/reports/${code}/schema`),

	run: (
		code: string,
		filters: Record<string, string>,
		page = 1,
		pageSize = 50,
	) =>
		_post<ReportRunResult>(`/api/v1/reports/${code}/run`, {
			filters,
			page,
			page_size: pageSize,
		}),

	export: (code: string, filters: Record<string, string>, format: string) =>
		_post<{ job_id: number }>(`/api/v1/reports/${code}/export`, {
			filters,
			format,
		}),

	pollJob: (jobId: number) => _get<ExportJob>(`/api/v1/reports/jobs/${jobId}`),

	listSavedViews: (code: string) =>
		_get<{ id: number; name: string; filters: Record<string, string> }[]>(
			`/api/v1/reports/saved-views?code=${code}`,
		),

	createSavedView: (
		report_code: string,
		name: string,
		filters: Record<string, string>,
	) =>
		_post<{ id: number }>("/api/v1/reports/saved-views", {
			report_code,
			name,
			filters,
		}),

	deleteSavedView: (id: number) => _delete(`/api/v1/reports/saved-views/${id}`),
};
