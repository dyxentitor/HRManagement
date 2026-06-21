import { describe, expect, it } from "vitest";

import type { PayslipRecord } from "../api";
import { monthLabel, payDateLabel, yearSummary } from "./payslip-ui";

function slip(over: Partial<PayslipRecord>): PayslipRecord {
	return {
		id: Math.random().toString(),
		employee_id: "e",
		period: "p",
		period_start: "2026-06-01",
		period_end: "2026-06-30",
		pay_date: "2026-06-28",
		gross: "6000",
		net: "4820.50",
		currency_code: "MYR",
		components: {},
		deductions: {},
		pdf_s3_key: "",
		pdf_url: null,
		pdf_generated_at: null,
		status: "published",
		published_at: "2026-06-28T00:00:00Z",
		source: "csv",
		created_at: "2026-06-28T00:00:00Z",
		...over,
	} as PayslipRecord;
}

describe("payslip-ui", () => {
	it("labels the month and pay date from the period (UTC-safe)", () => {
		const p = slip({ period_start: "2026-06-01", pay_date: "2026-06-28" });
		expect(monthLabel(p)).toBe("June 2026");
		expect(payDateLabel(p)).toMatch(/28 Jun 2026/);
	});

	it("sums YTD net + deducted across published payslips of the year", () => {
		const y = yearSummary(
			[
				slip({ period_start: "2026-05-01", gross: "6000", net: "4800" }),
				slip({ period_start: "2026-06-01", gross: "6000", net: "4820" }),
				slip({ period_start: "2025-12-01", gross: "6000", net: "4800" }), // other year
				slip({ period_start: "2026-04-01", status: "draft", net: "4800" }), // not published
			],
			2026,
		);
		expect(y.count).toBe(2);
		expect(y.net).toBe(9620);
		expect(y.deducted).toBe(2380); // (6000-4800) + (6000-4820)
	});
});
