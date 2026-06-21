const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export type OnboardingOverall =
	| "invited"
	| "activating"
	| "in_progress"
	| "needs_attention"
	| "complete";

export interface ProgressRow {
	user_id: string;
	employee_id: string | null;
	name: string;
	email: string;
	department: string | null;
	invitation_status: string;
	invitation_sent_at: string | null;
	invitation_expires_at: string;
	account_activated: boolean;
	profile_percent: number | null;
	profile_missing: string[];
	mfa_enabled: boolean;
	wizard_step: string | null;
	wizard_completed: boolean;
	checklist_id: string | null;
	checklist_done: number;
	checklist_total: number;
	overall: OnboardingOverall;
}

export interface ChecklistItem {
	id: string;
	label: string;
	done: boolean;
	order: number;
}
export interface Checklist {
	id: string;
	employee_id: string;
	status: string;
	items: ChecklistItem[];
}

async function authHeaders(json = false): Promise<Headers> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const h = new Headers();
	if (token) h.set("Authorization", `Bearer ${token}`);
	if (json) h.set("Content-Type", "application/json");
	return h;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	const r = await fetch(`${BASE_URL}/api/v1${path}`, init);
	if (r.status === 403) throw new Error("You don't have permission to view onboarding.");
	if (!r.ok) throw new Error(`Request failed (${r.status})`);
	return r.json();
}

export const onboardingBoardApi = {
	progress: async (): Promise<ProgressRow[]> =>
		req("/onboarding/progress/", { headers: await authHeaders() }),

	getChecklist: async (id: string): Promise<Checklist> =>
		req(`/onboarding/${id}/`, { headers: await authHeaders() }),

	startChecklist: async (employeeId: string): Promise<Checklist> =>
		req("/onboarding/", {
			method: "POST",
			headers: await authHeaders(true),
			body: JSON.stringify({ employee_id: employeeId }),
		}),

	toggleItem: async (checklistId: string, itemId: string): Promise<Checklist> =>
		req(`/onboarding/${checklistId}/items/${itemId}/toggle/`, {
			method: "PATCH",
			headers: await authHeaders(),
		}),
};
