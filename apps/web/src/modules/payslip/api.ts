import { api } from "@/lib/api";

export type PayrollPeriod = {
	id: string;
	period_start: string;
	period_end: string;
	period_type: string;
	pay_date: string;
	status: "draft" | "locked" | "published";
};

export type PayslipRecord = {
	id: string;
	employee_id: string;
	period: string;
	gross: string;
	net: string;
	currency_code: string;
	components: Record<string, string>;
	deductions: Record<string, string>;
	pdf_s3_key: string;
	pdf_url: string | null;
	pdf_generated_at: string | null;
	status: "draft" | "published" | "sent";
	published_at: string | null;
	source: string;
	created_at: string;
};

export type PayrollRun = {
	id: string;
	period: string;
	uploaded_by: string;
	status: "draft" | "validated" | "published" | "failed";
	row_count: number;
	errors: Array<{ row: number; error: string }>;
	csv_s3_key: string;
	published_at: string | null;
	created_at: string;
	updated_at: string;
};

export type UploadResult = {
	run_id: string;
	status: string;
	row_count: number;
	errors: Array<{ row: number; error: string }>;
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

function _unwrap<T>(d: { results?: T[] } | T[]): T[] {
	return Array.isArray(d) ? d : d.results ?? [];
}

export const payslipApi = {
	listMine: () =>
		_get<{ results?: PayslipRecord[] } | PayslipRecord[]>(
			"/api/v1/payslips/me/",
		).then(_unwrap),
	retrieve: (id: string) => _get<PayslipRecord>(`/api/v1/payslips/${id}/`),
	listPeriods: () =>
		_get<{ results?: PayrollPeriod[] } | PayrollPeriod[]>(
			"/api/v1/payroll/periods/",
		).then(_unwrap),
	createPeriod: (body: {
		period_start: string;
		period_end: string;
		period_type: string;
		pay_date: string;
	}) => _post<PayrollPeriod>("/api/v1/payroll/periods/", body),
	listRuns: () =>
		_get<{ results?: PayrollRun[] } | PayrollRun[]>(
			"/api/v1/payroll/runs/",
		).then(_unwrap),
	uploadRun: async (periodId: string, csvFile: File): Promise<UploadResult> => {
		const form = new FormData();
		form.append("period", periodId);
		form.append("csv", csvFile);
		const resp = await fetch("/api/v1/payroll/runs/", {
			method: "POST",
			body: form,
			headers: {
				Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
			},
		});
		if (!resp.ok) throw new Error("Upload failed");
		return resp.json() as Promise<UploadResult>;
	},
	preview: (runId: string) =>
		_post<{
			row_count: number;
			errors: Array<{ row: number; error: string }>;
			first_5_payslips: PayslipRecord[];
		}>(`/api/v1/payroll/runs/${runId}/preview/`),
	publish: (runId: string) =>
		_post<{ published: number }>(`/api/v1/payroll/runs/${runId}/publish/`),
	errors: (runId: string) =>
		_get<{ run_id: string; errors: Array<{ row: number; error: string }> }>(
			`/api/v1/payroll/runs/${runId}/errors/`,
		),
};
