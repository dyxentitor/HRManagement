import { describe, expect, it } from "vitest";

import type { Certification, TrainingAssignment } from "../api";
import { certStatusView, certSummary, trainingSummary } from "./cert-ui";

function iso(daysFromNow: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + daysFromNow);
	return d.toISOString().slice(0, 10);
}

function cert(over: Partial<Certification>): Certification {
	return {
		id: Math.random().toString(),
		employee_id: "e",
		name: "C",
		issuer: "",
		certificate_number: "",
		issued_on: "2024-01-01",
		expires_on: null,
		document_s3_key: "",
		status: "active",
		reminder_sent_30d: false,
		reminder_sent_60d: false,
		reminder_sent_90d: false,
		created_at: "",
		updated_at: "",
		...over,
	};
}

function asg(over: Partial<TrainingAssignment>): TrainingAssignment {
	return {
		id: Math.random().toString(),
		plan: "p",
		plan_name: "Plan",
		employee_id: "e",
		assigned_by: "m",
		due_date: iso(10),
		status: "assigned",
		completed_at: null,
		evidence_s3_key: "",
		progress: [],
		created_at: "",
		updated_at: "",
		...over,
	};
}

describe("cert-ui", () => {
	it("classifies cert status by expiry window", () => {
		expect(certStatusView(cert({ expires_on: iso(200) })).label).toBe("Active");
		expect(certStatusView(cert({ expires_on: iso(21) })).label).toBe("In 21d");
		expect(certStatusView(cert({ expires_on: iso(21) })).tone).toBe("yellow");
		expect(certStatusView(cert({ expires_on: iso(-3) })).label).toBe("Expired");
		expect(certStatusView(cert({ status: "revoked" })).label).toBe("Expired");
	});

	it("summarises certs into active / expiring / expired + next-to-expire", () => {
		const s = certSummary([
			cert({ name: "A", expires_on: iso(400) }),
			cert({ name: "B", expires_on: iso(15) }), // expiring
			cert({ name: "C", expires_on: iso(-10) }), // expired
		]);
		expect(s).toMatchObject({ total: 3, active: 1, expiring: 1, expired: 1 });
		expect(s.compliancePct).toBe(67); // 2 of 3 in good standing
		expect(s.nextToExpire?.name).toBe("B"); // soonest non-expired
	});

	it("summarises training completion + most urgent", () => {
		const s = trainingSummary([
			asg({ status: "completed" }),
			asg({ status: "in_progress", due_date: iso(5) }),
			asg({ status: "assigned", due_date: iso(-2) }), // overdue by date
		]);
		expect(s).toMatchObject({ total: 3, done: 1, inProgress: 1, overdue: 1 });
		expect(s.completionPct).toBe(33);
		expect(s.mostUrgent?.due_date).toBe(iso(-2)); // earliest, not completed
	});
});
