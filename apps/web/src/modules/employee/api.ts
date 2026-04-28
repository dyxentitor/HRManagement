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
};
