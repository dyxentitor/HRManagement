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

// Backend returns permission_codes / user_count; frontend interfaces use
// permissions / member_count. These helpers translate at the API boundary.
type BackendRoleSummary = Omit<RoleSummary, "member_count"> & {
	user_count: number;
};
type BackendRoleDetail = Omit<RoleDetail, "permissions" | "member_count"> & {
	permission_codes: string[];
	user_count: number;
};

function toRoleSummary(r: BackendRoleSummary): RoleSummary {
	const { user_count, ...rest } = r;
	return { ...rest, member_count: user_count };
}

function toRoleDetail(r: BackendRoleDetail): RoleDetail {
	const { permission_codes, user_count, ...rest } = r;
	return { ...rest, permissions: permission_codes, member_count: user_count };
}

type BackendUserRolesResponse = {
	user_id: string;
	email: string;
	role_codes: string[];
	permissions: string[];
};

export const roleApi = {
	list: async (): Promise<RoleSummary[]> => {
		const { data, error } = (await api.GET("/api/v1/roles/" as never)) as {
			data?: BackendRoleSummary[];
			error?: unknown;
		};
		if (error) throw new Error("Could not load roles");
		return (data ?? []).map(toRoleSummary);
	},

	retrieve: async (code: string): Promise<RoleDetail> => {
		const { data, error } = (await api.GET(
			"/api/v1/roles/{code}/" as never,
			{
				params: { path: { code } },
			} as never,
		)) as { data?: BackendRoleDetail; error?: unknown };
		if (error || !data) throw new Error("Could not load role");
		return toRoleDetail(data);
	},

	setPermissions: async (
		code: string,
		permissions: string[],
	): Promise<RoleDetail> => {
		const { data, error } = (await api.PATCH(
			"/api/v1/roles/{code}/permissions/" as never,
			{
				params: { path: { code } },
				body: { permission_codes: permissions },
			} as never,
		)) as { data?: BackendRoleDetail; error?: unknown };
		if (error || !data) throw new Error("Could not save permissions");
		return toRoleDetail(data);
	},

	reset: async (code: string): Promise<RoleDetail> => {
		const { data, error } = (await api.POST(
			"/api/v1/roles/{code}/reset-to-defaults/" as never,
			{
				params: { path: { code } },
			} as never,
		)) as { data?: BackendRoleDetail; error?: unknown };
		if (error || !data) throw new Error("Could not reset role");
		return toRoleDetail(data);
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
		)) as { data?: BackendUserRolesResponse; error?: unknown };
		if (error || !data) throw new Error("Could not assign roles");
		return { id: data.user_id, roles: data.role_codes };
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
