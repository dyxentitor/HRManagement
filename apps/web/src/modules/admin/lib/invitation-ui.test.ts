import { describe, expect, it } from "vitest";

import type { InvitationRow } from "../invitations-api";
import { STATUS_LABEL, STATUS_TONE, funnel, initials, timingLabel } from "./invitation-ui";

function row(over: Partial<InvitationRow>): InvitationRow {
	return {
		id: "i",
		user_id: "u",
		employee_id: null,
		email: "x@y.com",
		status: "sent",
		effective_status: "sent",
		expires_at: new Date(Date.now() + 60 * 3_600_000).toISOString(),
		sent_at: null,
		opened_at: null,
		activated_at: null,
		revoked_at: null,
		sent_count: 1,
		created_at: "",
		employee_name: "John Smith",
		department: null,
		...over,
	};
}

describe("invitation-ui", () => {
	it("maps statuses to tones + labels", () => {
		expect(STATUS_TONE.activated).toBe("mint");
		expect(STATUS_TONE.expired).toBe("yellow");
		expect(STATUS_TONE.revoked).toBe("coral");
		expect(STATUS_LABEL.opened).toBe("Opened");
	});

	it("summarises the funnel (pending = sent + opened)", () => {
		const f = funnel([
			row({ effective_status: "sent" }),
			row({ effective_status: "opened" }),
			row({ effective_status: "activated" }),
			row({ effective_status: "expired" }),
		]);
		expect(f).toMatchObject({ total: 4, pending: 2, activated: 1, expired: 1 });
	});

	it("renders contextual timing", () => {
		expect(
			timingLabel(row({ effective_status: "activated", activated_at: "2026-06-20T09:14:00Z" })),
		).toMatch(/activated/);
		expect(
			timingLabel(
				row({
					effective_status: "sent",
					expires_at: new Date(Date.now() + 60 * 3_600_000).toISOString(),
				}),
			),
		).toMatch(/expires in \d+d/);
		expect(
			timingLabel(
				row({
					effective_status: "expired",
					expires_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
				}),
			),
		).toMatch(/expired \d+d ago/);
	});

	it("derives avatar initials", () => {
		expect(initials("John Smith")).toBe("JS");
		expect(initials("Aisyah")).toBe("A");
	});
});
