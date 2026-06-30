import { api } from "@/lib/api";

export interface RoleSummary {
	code: string;
	name: string;
	description?: string;
	is_system: boolean;
	member_count: number;
	permission_count?: number;
}

export interface RoleDetail extends RoleSummary {
	permissions: string[];
	updated_at?: string;
}

// --- permission catalogue (the grouped, described permission tree) ---
export interface CataloguePermission {
	code: string;
	label: string;
	description: string;
	scope: "self" | "team" | "org" | null;
	requires: string[];
	dangerous: boolean;
	granted?: boolean;
}
export interface CatalogueModule {
	key: string;
	label: string;
	icon: string;
	permissions: CataloguePermission[];
	granted_count: number;
	total: number;
}

export interface RoleMember {
	user_id: string;
	employee_id: string | null;
	name: string;
	email: string;
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
		baseUpdatedAt?: string,
	): Promise<RoleDetail> => {
		const { data, error } = await api.PATCH("/api/v1/roles/{code}/permissions/", {
			params: { path: { code } },
			body: {
				permission_codes: permissions,
				base_updated_at: baseUpdatedAt ?? null,
			} as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not save permissions"));
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	reset: async (code: string): Promise<RoleDetail> => {
		const { data, error } = await api.POST("/api/v1/roles/{code}/reset-to-defaults/", {
			params: { path: { code } },
		});
		if (error || !data) throw new Error("Could not reset role");
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	create: async (name: string, description = ""): Promise<RoleDetail> => {
		const { data, error } = await api.POST("/api/v1/roles/", {
			body: { name, description } as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not create role"));
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	clone: async (sourceCode: string, name: string): Promise<RoleDetail> => {
		const { data, error } = await api.POST("/api/v1/roles/{code}/clone/", {
			params: { path: { code: sourceCode } },
			body: { name } as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not clone role"));
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	rename: async (
		code: string,
		body: { name?: string; description?: string },
	): Promise<RoleDetail> => {
		const { data, error } = await api.PATCH("/api/v1/roles/{code}/", {
			params: { path: { code } },
			body: body as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not update role"));
		return toRoleDetail(data as unknown as BackendRoleDetail);
	},

	remove: async (code: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/roles/{code}/", {
			params: { path: { code } },
		});
		if (error) throw new Error(extractErrMessage(error, "Could not delete role"));
	},
};

export const permissionApi = {
	catalogue: async (roleCode?: string): Promise<CatalogueModule[]> => {
		const { data, error } = await api.GET("/api/v1/permissions/catalogue/", {
			params: { query: roleCode ? { role: roleCode } : {} } as never,
		});
		if (error || !data) throw new Error("Could not load the permission catalogue");
		return (data as unknown as { modules: CatalogueModule[] }).modules;
	},
};

export const roleMembersApi = {
	list: async (code: string): Promise<RoleMember[]> => {
		const { data, error } = await api.GET("/api/v1/roles/{code}/members/", {
			params: { path: { code } },
		});
		if (error || !data) throw new Error("Could not load members");
		return data as unknown as RoleMember[];
	},
	add: async (code: string, userIds: string[]): Promise<RoleMember[]> => {
		const { data, error } = await api.POST("/api/v1/roles/{code}/members/", {
			params: { path: { code } },
			body: { user_ids: userIds } as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not add members"));
		return data as unknown as RoleMember[];
	},
	remove: async (code: string, userId: string): Promise<RoleMember[]> => {
		const { data, error } = await api.DELETE("/api/v1/roles/{code}/members/{user_id}/", {
			params: { path: { code, user_id: userId } } as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not remove member"));
		return data as unknown as RoleMember[];
	},
};

export const userRolesApi = {
	assign: async (userId: string, roleCodes: string[]): Promise<UserRolesResponse> => {
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
		invite_email?: string;
		employee?: Record<string, unknown>;
	}): Promise<{ id: string }> => {
		// The auth/user views lack @extend_schema, so the request body is
		// untyped in the OpenAPI contract — cast at the call site.
		const { data, error } = await api.POST("/api/v1/users/", {
			body: body as never,
		});
		if (error) throw new Error(extractErrMessage(error, "Could not create user"));
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
		const { data, error } = await api.PATCH("/api/v1/org/feature-flags/{key}/", {
			params: { path: { key } },
			body: { enabled } as never,
		});
		if (error || !data) throw new Error("Could not update feature flag");
		return data as unknown as FeatureFlag;
	},
};
