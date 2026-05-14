/**
 * v1.9.1 — typed wrappers for the v1.9.0 settings endpoints.
 *
 * Switched from raw-fetch (v1.9.0) to the openapi-fetch `api` client so we
 * inherit the auth + 401-refresh middleware in `@/lib/api`. The S3 PUT
 * inside LogoUploader stays as raw `fetch` because the presigned URL is
 * cross-origin and must not carry the bearer header.
 */
import { api } from "@/lib/api";

export interface SettingsOverview {
	stats: {
		employees_active: number;
		employees_archived: number;
		departments: number;
		modules_enabled: number;
		modules_total: number;
		roles: number;
		perm_codes: number;
	};
	attention: {
		unlinked_users_count: number;
		unlinked_employees_count: number;
	};
	recent_activity: Array<{
		action: string;
		summary: string;
		occurred_at: string;
	}>;
}

export interface UnlinkedUser {
	id: string;
	email: string;
	role_codes: string[];
	created_at: string;
	suggested_employee: {
		id: string;
		first_name: string;
		last_name: string;
		employee_code: string;
		email: string;
	} | null;
}

export interface UnlinkedEmployee {
	id: string;
	first_name: string;
	last_name: string;
	employee_code: string;
	email: string;
	department_name: string | null;
	suggested_user: { id: string; email: string } | null;
}

export interface ArchivedEmployee {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	deleted_at: string;
}

export interface Department {
	id: string;
	name: string;
	parent: string | null;
	head_employee_id: string | null;
}

export interface OrgSettings {
	id: string;
	name: string;
	slug: string;
	country_code: string;
	default_currency: string;
	default_timezone: string;
	default_locale: string;
	settings: Record<string, unknown>;
	status: string;
	logo_url: string | null;
}

function unwrapErr(error: unknown, fallback: string): never {
	if (error && typeof error === "object" && "detail" in error) {
		throw new Error(String((error as { detail: unknown }).detail));
	}
	if (error) throw new Error(JSON.stringify(error));
	throw new Error(fallback);
}

export const settingsApi = {
	overview: async (): Promise<SettingsOverview> => {
		const { data, error } = await api.GET("/api/v1/admin/settings-overview/");
		if (error) unwrapErr(error, "Failed to load overview");
		return data as unknown as SettingsOverview;
	},

	getOrg: async (): Promise<OrgSettings> => {
		const { data, error } = await api.GET("/api/v1/org/settings");
		if (error) unwrapErr(error, "Failed to load org settings");
		return data as unknown as OrgSettings;
	},

	patchOrg: async (payload: Partial<OrgSettings>): Promise<OrgSettings> => {
		const { data, error } = await api.PATCH("/api/v1/org/settings", {
			body: payload as never,
		});
		if (error) unwrapErr(error, "Failed to update org settings");
		return data as unknown as OrgSettings;
	},

	presignLogo: async (
		content_type: string,
	): Promise<{ presigned_url: string; s3_key: string }> => {
		const { data, error } = await api.POST(
			"/api/v1/org/logo/presigned-upload",
			{
				body: { content_type } as never,
			},
		);
		if (error) unwrapErr(error, "Failed to presign logo upload");
		return data as unknown as { presigned_url: string; s3_key: string };
	},

	registerLogo: async (
		s3_key: string,
		content_type: string,
		size_bytes: number,
	): Promise<OrgSettings> => {
		const { data, error } = await api.POST("/api/v1/org/logo", {
			body: { s3_key, content_type, size_bytes } as never,
		});
		if (error) unwrapErr(error, "Failed to register logo");
		return data as unknown as OrgSettings;
	},

	deleteLogo: async (): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/org/logo");
		if (error) unwrapErr(error, "Failed to delete logo");
	},

	listUnlinkedUsers: async (): Promise<UnlinkedUser[]> => {
		const { data, error } = await api.GET("/api/v1/admin/unlinked-users/");
		if (error) unwrapErr(error, "Failed to load unlinked users");
		return ((data ?? []) as unknown as UnlinkedUser[]) ?? [];
	},

	listUnlinkedEmployees: async (): Promise<UnlinkedEmployee[]> => {
		const { data, error } = await api.GET("/api/v1/admin/unlinked-employees/");
		if (error) unwrapErr(error, "Failed to load unlinked employees");
		return ((data ?? []) as unknown as UnlinkedEmployee[]) ?? [];
	},

	linkUser: async (employeeId: string, userId: string): Promise<void> => {
		const { error } = await api.POST("/api/v1/employees/{id}/link-user/", {
			params: { path: { id: employeeId } },
			body: { user_id: userId } as never,
		});
		if (error) unwrapErr(error, "Failed to link user");
	},

	unlinkUser: async (employeeId: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/employees/{id}/link-user/", {
			params: { path: { id: employeeId } },
		});
		if (error) unwrapErr(error, "Failed to unlink user");
	},

	listArchivedEmployees: async (): Promise<ArchivedEmployee[]> => {
		const { data, error } = await api.GET("/api/v1/employees/", {
			params: { query: { status: "archived" } as never },
		});
		if (error) unwrapErr(error, "Failed to load archived employees");
		return ((data ?? []) as unknown as ArchivedEmployee[]) ?? [];
	},

	restoreEmployee: async (id: string): Promise<void> => {
		const { error } = await api.POST("/api/v1/employees/{id}/restore/", {
			params: { path: { id } },
			body: {} as never,
		});
		if (error) unwrapErr(error, "Failed to restore employee");
	},

	listDepartments: async (): Promise<Department[]> => {
		const { data, error } = await api.GET("/api/v1/departments/");
		if (error) unwrapErr(error, "Failed to load departments");
		const body = (data ?? []) as unknown as
			| Department[]
			| { results: Department[] };
		return Array.isArray(body) ? body : body.results ?? [];
	},

	createDepartment: async (payload: {
		name: string;
		parent: string | null;
	}): Promise<Department> => {
		const { data, error } = await api.POST("/api/v1/departments/", {
			body: payload as never,
		});
		if (error) unwrapErr(error, "Failed to create department");
		return data as unknown as Department;
	},

	updateDepartment: async (
		id: string,
		payload: { name: string; parent: string | null },
	): Promise<Department> => {
		const { data, error } = await api.PATCH("/api/v1/departments/{id}/", {
			params: { path: { id } },
			body: payload as never,
		});
		if (error) unwrapErr(error, "Failed to update department");
		return data as unknown as Department;
	},

	deleteDepartment: async (id: string): Promise<void> => {
		const { error } = await api.DELETE("/api/v1/departments/{id}/", {
			params: { path: { id } },
		});
		if (error) unwrapErr(error, "Failed to delete department");
	},
};

/** v1.9.0 callers can keep using `unwrapResults` even though the typed
 * wrappers above already unwrap pagination — left here for backwards
 * compatibility with the page components. Safe to inline-drop in v1.10.0. */
export function unwrapResults<T>(body: T[] | { results: T[] }): T[] {
	if (Array.isArray(body)) return body;
	return body.results ?? [];
}
