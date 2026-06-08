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
		const { data, error } = await api.GET("/api/v1/roles/");
		if (error) throw new Error("Could not load roles");
		return ((data ?? []) as unknown as BackendRoleSummary[]).map(toRoleSummary);
	},

	retrieve: async (code: string): Promise<RoleDetail> => {
		const { data, error } = await api.GET("/api/v1/roles/{code}/", {
			params: { path: { code } },
		});
		if (error || !data) throw new Error("Could not load role");
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	setPermissions: async (
		code: string,
		permissions: string[],
	): Promise<RoleDetail> => {
		// drf-spectacular emits `requestBody?: never` for this APIView —
		// body is cast at the call site. Response shape is also unknown
		// to spectacular, so we re-decode via toRoleDetail.
		const { data, error } = await api.PATCH(
			"/api/v1/roles/{code}/permissions/",
			{
				params: { path: { code } },
				body: { permission_codes: permissions } as never,
			},
		);
		if (error || !data) throw new Error("Could not save permissions");
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	reset: async (code: string): Promise<RoleDetail> => {
		const { data, error } = await api.POST(
			"/api/v1/roles/{code}/reset-to-defaults/",
			{
				params: { path: { code } },
			},
		);
		if (error || !data) throw new Error("Could not reset role");
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},
};

export const userRolesApi = {
	assign: async (
		userId: string,
		roleCodes: string[],
	): Promise<UserRolesResponse> => {
		// Backend route is /users/<uuid:user_id>/roles/ — generated path
		// param is `user_id`. drf-spectacular emits `requestBody?: never`
		// for this APIView so the body is cast at the call site.
		const { data, error } = await api.PATCH("/api/v1/users/{user_id}/roles/", {
			params: { path: { user_id: userId } },
			body: { role_codes: roleCodes } as never,
		});
		if (error || !data) throw new Error("Could not assign roles");
		const decoded = data as unknown as BackendUserRolesResponse;
		return { id: decoded.user_id, roles: decoded.role_codes };
	},
};

// Extract a human-readable reason from an RFC 7807 / DRF error body so the
// UI can surface the real cause (duplicate email, bad role, etc.) instead of
// a generic message. Mirrors settings-api.ts::unwrapErr, plus errors[0].message.
function extractErrMessage(error: unknown, fallback: string): string {
	if (error && typeof error === "object") {
		const body = error as {
			detail?: unknown;
			errors?: Array<{ message?: unknown }>;
		};
		if (typeof body.detail === "string" && body.detail) return body.detail;
		const first = body.errors?.[0]?.message;
		if (typeof first === "string" && first) return first;
	}
	return fallback;
}

export const userApi = {
	create: async (body: {
		email: string;
		role_code: string;
		credential_method: "invite" | "temp";
		temp_password?: string;
		employee?: Record<string, unknown>;
	}): Promise<{ id: string }> => {
		// The auth/user views lack @extend_schema, so the request body is
		// untyped in the OpenAPI contract — cast at the call site.
		const { data, error } = await api.POST("/api/v1/users/", {
			body: body as never,
		});
		if (error)
			throw new Error(extractErrMessage(error, "Could not create user"));
		return data as unknown as { id: string };
	},
};

export const featureFlagApi = {
	list: async (): Promise<FeatureFlag[]> => {
		const { data, error } = await api.GET("/api/v1/org/feature-flags/");
		if (error) throw new Error("Could not load feature flags");
		return (data ?? []) as unknown as FeatureFlag[];
	},

	setEnabled: async (key: string, enabled: boolean): Promise<FeatureFlag> => {
		// drf-spectacular emits `requestBody?: never` for this APIView —
		// body is cast at the call site.
		const { data, error } = await api.PATCH(
			"/api/v1/org/feature-flags/{key}/",
			{
				params: { path: { key } },
				body: { enabled } as never,
			},
		);
		if (error || !data) throw new Error("Could not update feature flag");
		return data as unknown as FeatureFlag;
	},
};
