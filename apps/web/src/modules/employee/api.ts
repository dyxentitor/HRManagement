import { api } from "@/lib/api";

export const employeeApi = {
	getMe: async () => {
		const { data, error } = await api.GET("/api/v1/employees/me/");
		if (error) throw new Error("Could not load profile");
		return data as unknown;
	},
};
