import { authedFetch } from "@/lib/authed-fetch";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Path-relative wrapper over the shared authedFetch (adds the token +
// 401 → refresh → retry). Keeps the JSON Content-Type these endpoints expect.
async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");
	return authedFetch(`${BASE_URL}${path}`, { ...init, headers });
}

export interface OnboardingPrefs {
	theme?: string;
	locale?: string;
	timezone?: string;
	notifications?: { email?: boolean; digest?: boolean };
	onboarding?: { step?: string; completed?: boolean };
	[k: string]: unknown;
}

export const onboardingApi = {
	/** Merge-update the caller's own preferences (incl. onboarding progress). */
	updatePreferences: async (patch: OnboardingPrefs): Promise<OnboardingPrefs> => {
		const r = await authFetch("/api/v1/me/preferences", {
			method: "PATCH",
			body: JSON.stringify(patch),
		});
		if (!r.ok) throw new Error("Could not save your preferences");
		return r.json();
	},

	setStep: (step: string) => onboardingApi.updatePreferences({ onboarding: { step } }),
	complete: () => onboardingApi.updatePreferences({ onboarding: { completed: true } }),

	/** Begin MFA enrolment — returns a QR data-URL + the secret. */
	mfaEnable: async (): Promise<{ qr_code: string; secret?: string }> => {
		const r = await authFetch("/api/v1/auth/mfa/enable", { method: "POST" });
		if (!r.ok) throw new Error("Could not start MFA setup");
		return r.json();
	},

	mfaConfirm: async (code: string): Promise<void> => {
		const r = await authFetch("/api/v1/auth/mfa/confirm", {
			method: "POST",
			body: JSON.stringify({ code }),
		});
		if (!r.ok) throw new Error("That code didn't match — try again");
	},
};
