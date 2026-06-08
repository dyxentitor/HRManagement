import { api } from "@/lib/api";

export interface Employee {
	id: string;
	full_name: string;
	first_name?: string;
	last_name?: string;
	preferred_name?: string;
	role_title?: string;
	email?: string;
	phone?: string;
	alt_phone?: string;
	department_id?: string;
	department_name?: string;
	attendance_pct?: number;
	status?: string;
	hire_date?: string;
	employment_type?: string;
	employee_code?: string;
	ic_last4?: string;
	phone_alt?: string;
	date_of_birth?: string;
	gender?: string;
	nationality?: string;
	marital_status?: string;
	religion?: string;
	address_line1?: string;
	address_line2?: string;
	city?: string;
	state?: string;
	postcode?: string;
	country_code?: string;
	team?: string | null;
	manager?: string | null;
	bank_name?: string;
	bank_account_last4?: string;
	photo_url?: string | null;
	/** Auth user linked to this employee record, if any. */
	user_id?: string;
	/** Role codes currently assigned to the linked user. */
	user_roles?: string[];
	/** Profile completeness summary: percent filled + missing field groups. */
	profile_completeness?: { percent: number; missing: string[] };
}

export interface ReportingChainEntry {
	id: string;
	full_name: string;
	role_title?: string;
	department_name?: string;
	level: number;
}

export interface EmployeeWritePayload {
	// Identity
	employee_code: string;
	first_name: string;
	last_name: string;
	preferred_name?: string;
	email: string;
	// Employment
	department: string;
	team?: string | null;
	manager?: string | null;
	role_title: string;
	employment_type: string;
	schedule_type?: string;
	hire_date: string;
	status?: string;
	// Personal
	date_of_birth: string;
	gender: string;
	nationality: string;
	marital_status: string;
	religion?: string;
	ic_number?: string;
	// Address
	address_line1: string;
	address_line2?: string;
	city: string;
	state: string;
	postcode: string;
	country_code: string;
	phone: string;
	alt_phone?: string;
	// Banking & Tax IDs (encrypted; only sent if Replace was used)
	bank_name?: string;
	bank_account_number?: string;
	lhdn_tax_no?: string;
	epf_no?: string;
	socso_no?: string;
	eis_no?: string;
	emergency_contact_name: string;
	emergency_contact_relationship: string;
	emergency_contact_phone: string;
}

export interface DepartmentRef {
	id: string;
	name: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function authHeaders(
	extra: Record<string, string> = {},
): Promise<Record<string, string>> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const headers: Record<string, string> = { ...extra };
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

export const employeeApi = {
	/**
	 * Returns the signed-in user's Employee record, or null if their account
	 * isn't linked to one (admin/hr/finance demo accounts return null).
	 */
	getMe: async (): Promise<unknown | null> => {
		const result = (await api.GET("/api/v1/employees/me/")) as {
			data?: unknown;
			error?: unknown;
			response: Response;
		};
		if (result.error) {
			if (result.response?.status === 404) return null;
			throw new Error("Could not load profile");
		}
		return result.data;
	},
	list: async (): Promise<Employee[]> => {
		const { data, error } = await api.GET("/api/v1/employees/");
		if (error) throw new Error("Could not load employees");
		return (data ?? []) as unknown as Employee[];
	},
	retrieve: async (id: string): Promise<Employee | null> => {
		const result = (await api.GET("/api/v1/employees/{id}/", {
			params: { path: { id } },
		})) as {
			data?: Record<string, unknown>;
			error?: unknown;
			response: Response;
		};
		if (result.error) {
			if (result.response?.status === 404) return null;
			throw new Error("Could not load employee");
		}
		if (!result.data) return null;
		const { user, ...rest } = result.data;
		return { ...rest, user_id: user as string | undefined } as Employee;
	},
	getReportingChain: async (id: string): Promise<ReportingChainEntry[]> => {
		const headers = await authHeaders();
		const resp = await fetch(
			`${BASE_URL}/api/v1/employees/${id}/reporting-chain/`,
			{ headers },
		);
		if (!resp.ok) return [];
		return resp.json() as Promise<ReportingChainEntry[]>;
	},
	getDirectReports: async (id: string): Promise<Employee[]> => {
		const headers = await authHeaders();
		const resp = await fetch(
			`${BASE_URL}/api/v1/employees/${id}/direct-reports/`,
			{ headers },
		);
		if (!resp.ok) return [];
		return resp.json() as Promise<Employee[]>;
	},
	create: async (
		payload: EmployeeWritePayload & {
			provision?: {
				role_code: string;
				credential_method: "invite" | "temp";
				temp_password?: string;
				email?: string;
			};
		},
	): Promise<{ id: string }> => {
		const headers = await authHeaders({ "Content-Type": "application/json" });
		const resp = await fetch(`${BASE_URL}/api/v1/employees/`, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});
		if (!resp.ok) {
			const body = await resp.json().catch(() => ({}));
			throw Object.assign(new Error("Create failed"), {
				body,
				status: resp.status,
			});
		}
		return resp.json() as Promise<{ id: string }>;
	},
	update: async (
		id: string,
		payload: Partial<EmployeeWritePayload>,
		mfaCode?: string,
	): Promise<void> => {
		const extra: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (mfaCode) extra["X-MFA-Code"] = mfaCode;
		const headers = await authHeaders(extra);
		const resp = await fetch(`${BASE_URL}/api/v1/employees/${id}/`, {
			method: "PATCH",
			headers,
			body: JSON.stringify(payload),
		});
		if (!resp.ok) {
			const body = await resp.json().catch(() => ({}));
			throw Object.assign(new Error("Update failed"), {
				body,
				status: resp.status,
			});
		}
	},
	archive: async (id: string): Promise<void> => {
		const headers = await authHeaders();
		const resp = await fetch(`${BASE_URL}/api/v1/employees/${id}/`, {
			method: "DELETE",
			headers,
		});
		if (!resp.ok && resp.status !== 204) {
			throw new Error("Archive failed");
		}
	},
	assignTeam: async (id: string, teamId: string | null): Promise<void> => {
		const headers = await authHeaders({ "Content-Type": "application/json" });
		const resp = await fetch(`${BASE_URL}/api/v1/employees/${id}/`, {
			method: "PATCH",
			headers,
			body: JSON.stringify({ team: teamId }),
		});
		if (!resp.ok) throw new Error("Assign-team failed");
	},
	updateMe: async (
		payload: Partial<EmployeeWritePayload>,
		mfaCode?: string,
	): Promise<void> => {
		const extra: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (mfaCode) extra["X-MFA-Code"] = mfaCode;
		const headers = await authHeaders(extra);
		const resp = await fetch(`${BASE_URL}/api/v1/employees/me/`, {
			method: "PATCH",
			headers,
			body: JSON.stringify(payload),
		});
		if (!resp.ok) {
			const body = await resp.json().catch(() => ({}));
			throw Object.assign(new Error("Update failed"), {
				body,
				status: resp.status,
			});
		}
	},
	uploadMyPhoto: async (file: File): Promise<void> => {
		await uploadPhotoCore("/api/v1/employees/me/photo", file);
	},
	deleteMyPhoto: async (): Promise<void> => {
		const headers = await authHeaders();
		const resp = await fetch(`${BASE_URL}/api/v1/employees/me/photo/`, {
			method: "DELETE",
			headers,
		});
		if (!resp.ok && resp.status !== 204) {
			throw new Error("Delete photo failed");
		}
	},
	uploadEmployeePhoto: async (id: string, file: File): Promise<void> => {
		await uploadPhotoCore(`/api/v1/employees/${id}/photo`, file);
	},
	deleteEmployeePhoto: async (id: string): Promise<void> => {
		const headers = await authHeaders();
		const resp = await fetch(`${BASE_URL}/api/v1/employees/${id}/photo/`, {
			method: "DELETE",
			headers,
		});
		if (!resp.ok && resp.status !== 204) {
			throw new Error("Delete photo failed");
		}
	},
};

async function uploadPhotoCore(basePath: string, file: File): Promise<void> {
	const headers = await authHeaders({ "Content-Type": "application/json" });

	const presignResp = await fetch(`${BASE_URL}${basePath}/presigned-upload/`, {
		method: "POST",
		headers,
		body: JSON.stringify({ filename: file.name, content_type: file.type }),
	});
	if (!presignResp.ok) throw new Error("Presigned upload failed");
	const { presigned_url, s3_key } = (await presignResp.json()) as {
		presigned_url: string;
		s3_key: string;
		max_size_bytes: number;
	};

	const putResp = await fetch(presigned_url, {
		method: "PUT",
		headers: { "Content-Type": file.type },
		body: file,
	});
	if (!putResp.ok) throw new Error("S3 upload failed");

	const regResp = await fetch(`${BASE_URL}${basePath}/`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			s3_key,
			content_type: file.type,
			size_bytes: file.size,
		}),
	});
	if (!regResp.ok) throw new Error("Register photo failed");
}

export const departmentApi = {
	list: async (): Promise<DepartmentRef[]> => {
		const headers = await authHeaders();
		const resp = await fetch(`${BASE_URL}/api/v1/departments/`, { headers });
		if (!resp.ok) throw new Error("Could not load departments");
		const body = await resp.json();
		const rows = (Array.isArray(body) ? body : body.results ?? []) as {
			id: string;
			name: string;
		}[];
		return rows.map((r) => ({ id: r.id, name: r.name }));
	},
};
