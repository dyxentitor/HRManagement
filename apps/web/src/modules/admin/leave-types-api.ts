import { api } from "@/lib/api";

export type TenureBracket = { min_years: number; days: number };

export interface LeaveType {
	id: string;
	code: string;
	name: string;
	accrual_type: "annual" | "monthly" | "event_based" | "none";
	default_days: string;
	is_paid: boolean;
	requires_attachment: boolean;
	max_consecutive_days: number | null;
	min_advance_notice_days: number;
	carry_forward_max: string;
	is_statutory: boolean;
	gender_restriction: "any" | "male" | "female";
	carry_forward_expiry_months: number | null;
	requires_service_months: number;
	notice_days_required: number;
	max_per_lifetime_events: number | null;
}

export type LeaveTypeWritePayload = Omit<LeaveType, "id">;

export interface LeavePolicy {
	id: string;
	leave_type: string;
	applies_to_role_id: string | null;
	applies_to_department_id: string | null;
	days_per_year: string;
	tenure_brackets: TenureBracket[];
	effective_from: string;
	effective_to: string | null;
}

export type LeavePolicyWritePayload = Omit<LeavePolicy, "id">;

export const leaveTypeApi = {
	list: async (): Promise<LeaveType[]> => {
		const { data, error } = await api.GET("/api/v1/leave/types/");
		if (error) throw new Error("Could not load leave types");
		return ((data ?? []) as unknown as LeaveType[]) ?? [];
	},
	create: async (payload: LeaveTypeWritePayload): Promise<LeaveType> => {
		const { data, error } = await api.POST("/api/v1/leave/types/", {
			body: payload as never,
		});
		if (error) throw error;
		return data as unknown as LeaveType;
	},
	update: async (
		id: string,
		payload: Partial<LeaveTypeWritePayload>,
	): Promise<LeaveType> => {
		const { data, error } = await api.PATCH("/api/v1/leave/types/{id}/", {
			params: { path: { id } },
			body: payload as never,
		});
		if (error) throw error;
		return data as unknown as LeaveType;
	},
	remove: async (id: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/leave/types/{id}/", {
			params: { path: { id } },
		});
		if (error) throw error;
	},
};

export const leavePolicyApi = {
	list: async (leaveTypeId?: string): Promise<LeavePolicy[]> => {
		const url = leaveTypeId
			? `/api/v1/leave/policies/?leave_type=${leaveTypeId}`
			: "/api/v1/leave/policies/";
		const { data, error } = await api.GET(url as "/api/v1/leave/policies/");
		if (error) throw new Error("Could not load leave policies");
		return ((data ?? []) as unknown as LeavePolicy[]) ?? [];
	},
	create: async (payload: LeavePolicyWritePayload): Promise<LeavePolicy> => {
		const { data, error } = await api.POST("/api/v1/leave/policies/", {
			body: payload as never,
		});
		if (error) throw error;
		return data as unknown as LeavePolicy;
	},
	update: async (
		id: string,
		payload: Partial<LeavePolicyWritePayload>,
	): Promise<LeavePolicy> => {
		const { data, error } = await api.PATCH("/api/v1/leave/policies/{id}/", {
			params: { path: { id } },
			body: payload as never,
		});
		if (error) throw error;
		return data as unknown as LeavePolicy;
	},
	remove: async (id: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/leave/policies/{id}/", {
			params: { path: { id } },
		});
		if (error) throw error;
	},
};
