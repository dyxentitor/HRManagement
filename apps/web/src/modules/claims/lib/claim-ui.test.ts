import { describe, expect, it } from "vitest";

import type { ClaimRequest } from "../api";
import {
	bucketOf,
	categoryCopy,
	categoryMeta,
	displayStatus,
	stageStates,
	summarise,
} from "./claim-ui";

function claim(over: Partial<ClaimRequest>): ClaimRequest {
	return {
		id: Math.random().toString(),
		employee: "e",
		category: "c",
		category_code: "MEDICAL",
		amount: "100",
		currency_code: "MYR",
		expense_date: "2026-06-01",
		description: "",
		merchant: "",
		status: "submitted",
		current_level: 1,
		submitted_at: "2026-06-01T00:00:00Z",
		reimbursed_at: null,
		reimbursement_reference: "",
		attachments: [],
		...over,
	} as ClaimRequest;
}

describe("claim-ui", () => {
	it("buckets statuses into pending/approved/paid/rejected", () => {
		expect(bucketOf("submitted")).toBe("pending");
		expect(bucketOf("manager_approved")).toBe("pending");
		expect(bucketOf("finance_approved")).toBe("approved");
		expect(bucketOf("reimbursed")).toBe("paid");
		expect(bucketOf("rejected")).toBe("rejected");
		expect(bucketOf("draft")).toBeNull();
		expect(bucketOf("cancelled")).toBeNull();
	});

	it("summarises counts + amounts per bucket", () => {
		const stats = summarise([
			claim({ status: "submitted", amount: "100" }),
			claim({ status: "manager_approved", amount: "50" }),
			claim({ status: "reimbursed", amount: "200" }),
			claim({ status: "rejected", amount: "30" }),
			claim({ status: "draft", amount: "999" }), // ignored
		]);
		expect(stats.pending.count).toBe(2);
		expect(stats.pending.amount).toBe(150);
		expect(stats.paid.amount).toBe(200);
		expect(stats.rejected.count).toBe(1);
	});

	it("derives 'manager_approved' once the manager has approved (current_level > 1)", () => {
		// submitted, no approvals yet
		expect(displayStatus({ status: "submitted", current_level: 1 })).toBe("submitted");
		// manager (level 1) approved → engine keeps status 'submitted', advances level
		expect(displayStatus({ status: "submitted", current_level: 2 })).toBe("manager_approved");
		// terminal statuses pass through unchanged
		expect(displayStatus({ status: "finance_approved", current_level: 2 })).toBe(
			"finance_approved",
		);
		expect(displayStatus({ status: "reimbursed", current_level: 3 })).toBe("reimbursed");
	});

	it("maps claim status to the 4-stage journey", () => {
		expect(stageStates("submitted")).toEqual(["done", "current", "upcoming", "upcoming"]);
		expect(stageStates("finance_approved")).toEqual(["done", "done", "done", "current"]);
		expect(stageStates("reimbursed")).toEqual(["done", "done", "done", "done"]);
	});

	// Every canonical category must resolve to a distinct, non-fallback icon so
	// the dropdown + dashboard cards don't render as a wall of generic receipts.
	// MISC is intentionally the fallback.
	const CANONICAL = [
		"TRANSPORT Transportation",
		"MEDICAL Medical & Healthcare",
		"OFFICE Office & Work Supplies",
		"IT_SOFTWARE IT & Software",
		"TRAINING Training & Certification",
		"WELFARE Employee Welfare",
	];

	it("gives every canonical category a specific icon (MISC falls back)", () => {
		const fallback = categoryMeta("__nothing_matches__");
		for (const key of CANONICAL) {
			expect(categoryMeta(key).icon, `${key} should not use the fallback icon`).not.toBe(
				fallback.icon,
			);
		}
		expect(categoryMeta("MISC Miscellaneous").icon).toBe(fallback.icon);
	});

	it("gives each canonical category distinct explainer copy", () => {
		const generic = categoryCopy("__nothing_matches__", true);
		for (const key of CANONICAL) {
			expect(categoryCopy(key, true), `${key} should have specific copy`).not.toBe(generic);
		}
	});

	it("uses a ground-transport icon for Transportation, not the flight icon", () => {
		expect(categoryMeta("TRANSPORT Transportation").icon).not.toBe(
			categoryMeta("TRAVEL Travel").icon,
		);
	});
});
