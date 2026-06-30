import { api } from "@/lib/api";

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled";
export type PayoutStatus = "" | "pending" | "approved" | "paid";
export type ProjectStatus = "open" | "closed";

export interface Customer {
	id: string;
	name: string;
	is_active: boolean;
	notes: string;
	mandays_total: string;
	mandays_remaining: string;
	created_at: string;
}

export interface Project {
	id: string;
	customer: string;
	customer_name: string;
	name: string;
	description: string;
	budget_mandays: string;
	manager_id: string;
	include_soc: boolean;
	status: ProjectStatus;
	deadline: string | null;
	mandays_approved: string;
	mandays_remaining: string;
	created_at: string;
}

// --- command-center overview ---
export interface OverviewKpis {
	total_projects: number;
	active_projects: number;
	closed_projects: number;
	pool_total: string;
	pool_remaining: string;
	allocated_budget: string;
	consumed: string;
	pending_claims: number;
	approved_claims: number;
	rejected_claims: number;
	payout_rm_quarter: string;
	soc_projects: number;
	rate: string;
}
export interface OverviewPool {
	id: string;
	name: string;
	project_count: number;
	remaining: string;
	total: string;
	pct_used: number;
}
export interface OverviewProject {
	id: string;
	name: string;
	customer_name: string;
	manager_id: string;
	budget: string;
	consumed: string;
	remaining: string;
	status: ProjectStatus;
	include_soc: boolean;
	deadline: string | null;
}
export interface OverviewContributor {
	employee_id: string;
	name: string;
	department: string;
	mandays: string;
	rm: string;
}
export interface OverviewActivity {
	type: string;
	label_type: string;
	mandays: string;
	target: string;
	created_at: string;
}
export interface OverviewDeadline {
	id: string;
	name: string;
	customer_name: string;
	deadline: string;
	overdue: boolean;
}
export interface Overview {
	kpis: OverviewKpis;
	pools: OverviewPool[];
	projects: OverviewProject[];
	consumption: { quarter: string; mandays: string }[];
	claim_breakdown: { approved: number; pending: number; rejected: number };
	top_contributors: OverviewContributor[];
	recent_activity: OverviewActivity[];
	deadlines: OverviewDeadline[];
}

export interface Claim {
	id: string;
	project: string;
	project_name: string;
	employee_id: string;
	mandays: string;
	note: string;
	status: ClaimStatus;
	reviewed_by: string | null;
	reviewed_at: string | null;
	reject_reason: string;
	billing_quarter: string;
	payout_status: PayoutStatus;
	created_at: string;
}

export interface Bond {
	id: string;
	employee_id: string;
	accepted_at: string | null;
	period_start: string;
	period_end: string;
	terms_version: string;
	is_active: boolean;
	created_at: string;
}

function _msg(error: unknown, fallback: string): string {
	if (error && typeof error === "object") {
		const e = error as { errors?: { message?: string }[]; detail?: string };
		const first = e.errors?.[0]?.message ?? e.detail;
		if (typeof first === "string" && first) return first;
	}
	return fallback;
}

async function _get<T>(url: string): Promise<T> {
	const { data, error } = await api.GET(url as never);
	if (error) throw new Error(_msg(error, `GET ${url} failed`));
	return data as T;
}
async function _post<T>(url: string, body?: unknown): Promise<T> {
	const { data, error } = await api.POST(url as never, (body ? { body } : undefined) as never);
	if (error) throw new Error(_msg(error, `POST ${url} failed`));
	return data as T;
}
async function _patch<T>(url: string, body: unknown): Promise<T> {
	const { data, error } = await api.PATCH(url as never, { body } as never);
	if (error) throw new Error(_msg(error, `PATCH ${url} failed`));
	return data as T;
}

const unwrap = <T>(d: { results?: T[] } | T[]): T[] => (Array.isArray(d) ? d : (d.results ?? []));

const BASE = "/api/v1/incentive";

export const incentiveApi = {
	customers: {
		list: () => _get<{ results?: Customer[] } | Customer[]>(`${BASE}/customers/`).then(unwrap),
		create: (body: { name: string; notes?: string }) => _post<Customer>(`${BASE}/customers/`, body),
		topUp: (id: string, mandays: string, note = "") =>
			_post<Customer>(`${BASE}/customers/${id}/top_up/`, { mandays, note }),
	},
	overview: () => _get<Overview>(`${BASE}/overview/`),
	projects: {
		list: () => _get<{ results?: Project[] } | Project[]>(`${BASE}/projects/`).then(unwrap),
		create: (body: {
			customer: string;
			name: string;
			budget_mandays: string;
			description?: string;
			include_soc?: boolean;
			deadline?: string | null;
		}) => _post<Project>(`${BASE}/projects/`, body),
		update: (id: string, body: Partial<Pick<Project, "include_soc" | "name" | "description">>) =>
			_patch<Project>(`${BASE}/projects/${id}/`, body),
	},
	claims: {
		list: () => _get<{ results?: Claim[] } | Claim[]>(`${BASE}/claims/`).then(unwrap),
		create: (body: { project: string; mandays: string; note?: string }) =>
			_post<Claim>(`${BASE}/claims/`, body),
		approve: (id: string) => _post<Claim>(`${BASE}/claims/${id}/approve/`),
		reject: (id: string, reason = "") => _post<Claim>(`${BASE}/claims/${id}/reject/`, { reason }),
		reverse: (id: string, reason = "") => _post<Claim>(`${BASE}/claims/${id}/reverse/`, { reason }),
		setPayout: (id: string, payout_status: PayoutStatus) =>
			_post<Claim>(`${BASE}/claims/${id}/set_payout/`, { payout_status }),
	},
	bonds: {
		list: () => _get<{ results?: Bond[] } | Bond[]>(`${BASE}/bonds/`).then(unwrap),
		accept: (id: string) => _post<Bond>(`${BASE}/bonds/${id}/accept/`),
	},
};
