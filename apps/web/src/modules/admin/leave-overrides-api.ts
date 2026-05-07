import { api } from "@/lib/api";

export interface LeaveOverride {
	id: string;
	employee_id: string;
	leave_type: string;
	days_override: string;
	effective_from: string;
	effective_to: string | null;
	note: string;
	created_by: string | null;
	created_at: string;
}

export interface LeaveOverrideWritePayload {
	leave_type: string;
	days_override: string;
	effective_from: string;
	effective_to?: string | null;
	note?: string;
	employee_id: string;
}

export const leaveOverrideApi = {
	list: async (employeeId: string): Promise<LeaveOverride[]> => {
		const { data, error } = await api.GET(
			`/api/v1/leave/employee-overrides/?employee=${employeeId}` as "/api/v1/leave/employee-overrides/",
		);
		if (error) throw new Error("Could not load overrides");
		return ((data ?? []) as unknown as LeaveOverride[]) ?? [];
	},
	create: async (
		payload: LeaveOverrideWritePayload,
	): Promise<LeaveOverride> => {
		const { data, error } = await api.POST(
			"/api/v1/leave/employee-overrides/",
			{ body: payload as never },
		);
		if (error) throw error;
		return data as unknown as LeaveOverride;
	},
	remove: async (id: string): Promise<void> => {
		const { error } = await api.DELETE(
			"/api/v1/leave/employee-overrides/{id}/",
			{ params: { path: { id } } },
		);
		if (error) throw error;
	},
};
