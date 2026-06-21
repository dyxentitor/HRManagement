import { describe, expect, it } from "vitest";

import type { ProgressRow } from "./onboarding-board-api";
import { OVERALL_TONE, funnel, stepTrack } from "./onboarding-board-ui";

function row(over: Partial<ProgressRow>): ProgressRow {
	return {
		user_id: "u",
		employee_id: "e",
		name: "John Smith",
		email: "j@x.com",
		department: "Eng",
		invitation_status: "activated",
		invitation_sent_at: null,
		invitation_expires_at: "2999-01-01",
		account_activated: true,
		profile_percent: 80,
		profile_missing: ["bank_details"],
		mfa_enabled: true,
		wizard_step: "profile",
		wizard_completed: false,
		checklist_id: "c",
		checklist_done: 3,
		checklist_total: 6,
		overall: "in_progress",
		...over,
	};
}

describe("onboarding-board-ui", () => {
	it("maps overall statuses to tones", () => {
		expect(OVERALL_TONE.complete).toBe("mint");
		expect(OVERALL_TONE.needs_attention).toBe("coral");
		expect(OVERALL_TONE.invited).toBe("peach");
	});

	it("summarises the funnel (complete / needs-help / in-progress)", () => {
		const f = funnel([
			row({ overall: "complete" }),
			row({ overall: "needs_attention" }),
			row({ overall: "in_progress" }),
			row({ overall: "invited" }),
		]);
		expect(f).toEqual({ total: 4, complete: 1, needsHelp: 1, inProgress: 2 });
	});

	it("builds the 5-step track with the right states", () => {
		const cells = stepTrack(
			row({ account_activated: true, profile_percent: 100, wizard_completed: true }),
		);
		expect(cells.map((c) => c.label)).toEqual(["Invite", "Password", "Profile", "Prefs", "Tasks"]);
		expect(cells[1].state).toBe("done"); // password (activated)
		expect(cells[2].state).toBe("done"); // profile 100%
		expect(cells[3].state).toBe("done"); // prefs (wizard completed)
		expect(cells[4].text).toBe("3/6"); // tasks count
	});
});
