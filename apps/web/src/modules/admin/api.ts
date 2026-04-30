import { api } from "@/lib/api";

export interface RoleSummary {
	code: string;
	name: string;
	description?: string;
	is_system: boolean;
	member_count: number;
}

export interface RoleDetail extends RoleSummary {
	permissions: string[];
}

export interface UserRolesResponse {
	id: string;
	roles: string[];
}

export interface FeatureFlag {
	key: string;
	label: string;
	enabled: boolean;
	critical: boolean;
	togglable: boolean;
	derived: boolean;
	depends_on?: string[];
	depends_on_any?: string[];
}

export const roleApi = {
	list: async (): Promise<RoleSummary[]> => {
		const { data, error } = (await api.GET("/api/v1/roles/" as never)) as {
			data?: RoleSummary[];
			error?: unknown;
		};
		if (error) throw new Error("Could not load roles");
		return data ?? [];
	},

	retrieve: async (code: string): Promise<RoleDetail> => {
		const { data, error } = (await api.GET(
			"/api/v1/roles/{code}/" as never,
			{
				params: { path: { code } },
			} as never,
		)) as { data?: RoleDetail; error?: unknown };
		if (error || !data) throw new Error("Could not load role");
		return data;
	},

	setPermissions: async (
		code: string,
		permissions: string[],
	): Promise<RoleDetail> => {
		const { data, error } = (await api.PATCH(
			"/api/v1/roles/{code}/permissions/" as never,
			{
				params: { path: { code } },
				body: { permissions },
			} as never,
		)) as { data?: RoleDetail; error?: unknown };
		if (error || !data) throw new Error("Could not save permissions");
		return data;
	},

	reset: async (code: string): Promise<RoleDetail> => {
		const { data, error } = (await api.POST(
			"/api/v1/roles/{code}/reset-to-defaults/" as never,
			{
				params: { path: { code } },
			} as never,
		)) as { data?: RoleDetail; error?: unknown };
		if (error || !data) throw new Error("Could not reset role");
		return data;
	},
};

export const userRolesApi = {
	assign: async (
		userId: string,
		roleCodes: string[],
	): Promise<UserRolesResponse> => {
		const { data, error } = (await api.PATCH(
			"/api/v1/users/{id}/roles/" as never,
			{
				params: { path: { id: userId } },
				body: { role_codes: roleCodes },
			} as never,
		)) as { data?: UserRolesResponse; error?: unknown };
		if (error || !data) throw new Error("Could not assign roles");
		return data;
	},
};

export const featureFlagApi = {
	list: async (): Promise<FeatureFlag[]> => {
		const { data, error } = (await api.GET(
			"/api/v1/org/feature-flags/" as never,
		)) as {
			data?: FeatureFlag[];
			error?: unknown;
		};
		if (error) throw new Error("Could not load feature flags");
		return data ?? [];
	},

	setEnabled: async (key: string, enabled: boolean): Promise<FeatureFlag> => {
		const { data, error } = (await api.PATCH(
			"/api/v1/org/feature-flags/{key}/" as never,
			{
				params: { path: { key } },
				body: { enabled },
			} as never,
		)) as { data?: FeatureFlag; error?: unknown };
		if (error || !data) throw new Error("Could not update feature flag");
		return data;
	},
};
