import { api } from "@/lib/api";

export interface Employee {
	id: string;
	full_name: string;
	role_title?: string;
	email?: string;
	phone?: string;
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
	address_line1?: string;
	city?: string;
	state?: string;
	postcode?: string;
	country_code?: string;
	/** Auth user linked to this employee record, if any. */
	user_id?: string;
	/** Role codes currently assigned to the linked user. */
	user_roles?: string[];
}

export interface ReportingChainEntry {
	id: string;
	full_name: string;
	role_title?: string;
	department_name?: string;
	level: number;
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
		// Backend returns `user` (FK UUID); frontend expects `user_id`.
		const { user, ...rest } = result.data;
		return { ...rest, user_id: user as string | undefined } as Employee;
	},
	getReportingChain: async (id: string): Promise<ReportingChainEntry[]> => {
		const BASE_URL =
			import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
		const { tokenStorage } = await import("@/lib/token-storage");
		const token = tokenStorage.getAccess();
		const headers: Record<string, string> = {};
		if (token) headers.Authorization = `Bearer ${token}`;
		const resp = await fetch(
			`${BASE_URL}/api/v1/employees/${id}/reporting-chain/`,
			{ headers },
		);
		if (!resp.ok) return [];
		return resp.json() as Promise<ReportingChainEntry[]>;
	},
	getDirectReports: async (id: string): Promise<Employee[]> => {
		const BASE_URL =
			import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
		const { tokenStorage } = await import("@/lib/token-storage");
		const token = tokenStorage.getAccess();
		const headers: Record<string, string> = {};
		if (token) headers.Authorization = `Bearer ${token}`;
		const resp = await fetch(
			`${BASE_URL}/api/v1/employees/${id}/direct-reports/`,
			{ headers },
		);
		if (!resp.ok) return [];
		return resp.json() as Promise<Employee[]>;
	},
};
