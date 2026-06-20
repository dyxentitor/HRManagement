const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export interface AuditRow {
	id: number;
	ts: string;
	actor_id: string | null;
	actor: string;
	action: string;
	entity: string;
	entity_id: string;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	ip: string | null;
}

export interface AuditPage {
	results: AuditRow[];
	count: number;
	page: number;
	page_size: number;
	entities: string[];
}

export interface AuditFilters {
	page?: number;
	page_size?: number;
	entity?: string;
	action?: string;
	date_from?: string;
	date_to?: string;
	q?: string;
}

async function authHeaders(): Promise<Headers> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const headers = new Headers();
	if (token) headers.set("Authorization", `Bearer ${token}`);
	return headers;
}

function queryString(filters: AuditFilters): string {
	const p = new URLSearchParams();
	for (const [k, v] of Object.entries(filters)) {
		if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
	}
	const s = p.toString();
	return s ? `?${s}` : "";
}

export async function listAuditLogs(filters: AuditFilters): Promise<AuditPage> {
	const resp = await fetch(`${BASE_URL}/api/v1/audit/logs${queryString(filters)}`, {
		headers: await authHeaders(),
	});
	if (resp.status === 403) throw new Error("You don't have permission to view audit logs.");
	if (!resp.ok) throw new Error(`Could not load audit log (${resp.status})`);
	return resp.json();
}

/** Fetch the filtered CSV (auth-protected) and trigger a browser download. */
export async function downloadAuditCsv(filters: AuditFilters): Promise<void> {
	const { page, page_size, ...rest } = filters;
	void page;
	void page_size;
	const resp = await fetch(
		`${BASE_URL}/api/v1/audit/logs${queryString({ ...rest, export: "csv" } as AuditFilters & { export: string })}`,
		{ headers: await authHeaders() },
	);
	if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
	const blob = await resp.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "audit-log.csv";
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
