/**
 * v1.9.0 — raw-fetch wrappers for the new /admin/settings/* endpoints.
 *
 * Uses raw fetch instead of the typed openapi-fetch `api` client because
 * these endpoints aren't yet present in the generated OpenAPI schema.
 * The release task (Task 20) regenerates contracts; from then on these
 * helpers can be optionally retyped against `api.GET/POST/...` if desired.
 */
import { tokenStorage } from "@/lib/token-storage";

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function rawFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = tokenStorage.getAccess();
	const headers: Record<string, string> = {
		...(init.headers as Record<string, string>),
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	if (init.body && !headers["Content-Type"])
		headers["Content-Type"] = "application/json";

	const resp = await fetch(`${BASE}${path}`, { ...init, headers });
	if (!resp.ok) {
		let detail: string;
		try {
			detail = JSON.stringify(await resp.json());
		} catch {
			detail = `${resp.status} ${resp.statusText}`;
		}
		throw new Error(detail);
	}
	if (resp.status === 204) return undefined as T;
	return resp.json();
}

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

export const settingsApi = {
	overview: () =>
		rawFetch<SettingsOverview>("/api/v1/admin/settings-overview/"),
	getOrg: () => rawFetch<OrgSettings>("/api/v1/org/settings"),
	patchOrg: (payload: Partial<OrgSettings>) =>
		rawFetch<OrgSettings>("/api/v1/org/settings", {
			method: "PATCH",
			body: JSON.stringify(payload),
		}),
	presignLogo: (content_type: string) =>
		rawFetch<{ presigned_url: string; s3_key: string }>(
			"/api/v1/org/logo/presigned-upload",
			{ method: "POST", body: JSON.stringify({ content_type }) },
		),
	registerLogo: (s3_key: string, content_type: string, size_bytes: number) =>
		rawFetch<OrgSettings>("/api/v1/org/logo", {
			method: "POST",
			body: JSON.stringify({ s3_key, content_type, size_bytes }),
		}),
	deleteLogo: () => rawFetch<void>("/api/v1/org/logo", { method: "DELETE" }),
	listUnlinkedUsers: () =>
		rawFetch<UnlinkedUser[] | { results: UnlinkedUser[] }>(
			"/api/v1/admin/unlinked-users/",
		),
	listUnlinkedEmployees: () =>
		rawFetch<UnlinkedEmployee[] | { results: UnlinkedEmployee[] }>(
			"/api/v1/admin/unlinked-employees/",
		),
	linkUser: (employeeId: string, userId: string) =>
		rawFetch(`/api/v1/employees/${employeeId}/link-user/`, {
			method: "POST",
			body: JSON.stringify({ user_id: userId }),
		}),
	unlinkUser: (employeeId: string) =>
		rawFetch(`/api/v1/employees/${employeeId}/link-user/`, {
			method: "DELETE",
		}),
	listArchivedEmployees: () =>
		rawFetch<ArchivedEmployee[] | { results: ArchivedEmployee[] }>(
			"/api/v1/employees/?status=archived",
		),
	restoreEmployee: (id: string) =>
		rawFetch(`/api/v1/employees/${id}/restore/`, {
			method: "POST",
			body: "{}",
		}),
	listDepartments: () =>
		rawFetch<Department[] | { results: Department[] }>("/api/v1/departments/"),
	createDepartment: (payload: { name: string; parent: string | null }) =>
		rawFetch<Department>("/api/v1/departments/", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	updateDepartment: (
		id: string,
		payload: { name: string; parent: string | null },
	) =>
		rawFetch<Department>(`/api/v1/departments/${id}/`, {
			method: "PATCH",
			body: JSON.stringify(payload),
		}),
	deleteDepartment: (id: string) =>
		rawFetch<void>(`/api/v1/departments/${id}/`, { method: "DELETE" }),
};

export function unwrapResults<T>(body: T[] | { results: T[] }): T[] {
	if (Array.isArray(body)) return body;
	return body.results ?? [];
}
