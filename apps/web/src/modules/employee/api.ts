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
	getMe: async (): Promise<unknown> => {
		const { data, error } = await api.GET("/api/v1/employees/me/");
		if (error) throw new Error("Could not load profile");
		return data;
	},
	list: async (): Promise<Employee[]> => {
		const { data, error } = await api.GET("/api/v1/employees/");
		if (error) throw new Error("Could not load employees");
		return (data ?? []) as unknown as Employee[];
	},
};
