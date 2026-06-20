const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export type CardData = {
	type: string;
	title: string;
	data: Record<string, unknown>;
};

export type DashboardResponse = {
	variant: string;
	cards: CardData[];
};

// ---- Typed card data shapes (v1.12.0 operational dashboard) ----

export type Tone = "peach" | "lavender" | "mint" | "yellow" | "coral" | "sky";

export interface HeroSummaryData {
	today: string;
	working_day: string;
	next_payroll_date: string | null;
	days_to_payroll: number | null;
}

export interface PendingTask {
	key: string;
	label: string;
	count: number;
	tone: Tone;
	action_route: string;
}
export interface PendingTasksData {
	tasks: PendingTask[];
}

export interface EmployeeSnapshotData {
	total: number;
	active: number;
	on_leave: number;
	on_probation: number;
	resigned_this_month: number;
}

export interface AttendanceSummaryData {
	date: string;
	team_size: number;
	present: number;
	late: number;
	absent: number;
	on_leave: number;
	partial: number;
}

export interface PayrollStage {
	key: string;
	label: string;
	state: "done" | "current" | "upcoming";
}
export interface PayrollStatusData {
	current: string | null;
	pay_date: string | null;
	stages: PayrollStage[];
}

export interface ActivityItem {
	ts: string;
	actor: string;
	action: string;
	entity: string;
	entity_id: string;
}
export interface ActivityFeedData {
	items: ActivityItem[];
}

export interface DepartmentRow {
	name: string;
	count: number;
}
export interface DepartmentOverviewData {
	departments: DepartmentRow[];
}

export interface AnnouncementItem {
	id: string;
	title: string;
	category: string;
	pinned: boolean;
	published_at: string;
}
export interface CompanyAnnouncementsData {
	items: AnnouncementItem[];
}

async function authFetch(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const headers = new Headers(options.headers);
	if (token) headers.set("Authorization", `Bearer ${token}`);
	return fetch(url, { ...options, headers });
}

export async function getDashboard(
	variant: "me" | "team" | "admin",
): Promise<DashboardResponse> {
	const resp = await authFetch(`${BASE_URL}/api/v1/dashboards/${variant}`);
	if (!resp.ok) throw new Error(`Dashboard fetch failed: ${resp.status}`);
	return resp.json();
}
