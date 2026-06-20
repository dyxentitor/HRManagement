import { describe, expect, it, vi } from "vitest";

// Mock the generated openapi client so we exercise leaveApi's RFC 7807
// extraction (_errorMessage) without touching fetch/MSW.
const mocks = vi.hoisted(() => ({ POST: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { GET: vi.fn(), POST: mocks.POST } }));

import { leaveApi } from "./api";

describe("leaveApi error message extraction (v1.10.1 regression)", () => {
	it("surfaces errors[0].message from an RFC 7807 body", async () => {
		mocks.POST.mockResolvedValue({
			data: undefined,
			error: {
				type: "about:blank",
				title: "Validation failed",
				status: 400,
				detail: "One or more fields failed validation.",
				errors: [
					{
						field: "start_date",
						code: "invalid",
						message: "Paternity Leave requires 30 days of advance notice.",
					},
				],
			},
		});
		await expect(leaveApi.submit("any")).rejects.toThrow(
			/Paternity Leave requires 30 days of advance notice\./,
		);
	});
});
