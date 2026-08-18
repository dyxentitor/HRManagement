import { afterEach, describe, expect, it, vi } from "vitest";

// Hoist the mock fn so vi.mock factory can reference it (vi.mock is hoisted to
// top-of-file by Vitest; variables defined after the import block are not yet
// in scope at that point).
const mocks = vi.hoisted(() => ({
	authedFetch: vi.fn(),
}));

// Mock authedFetch so tests run without a real server or token storage.
// We exercise the URL-building and error-message-extraction logic directly.
vi.mock("@/lib/authed-fetch", () => ({ authedFetch: mocks.authedFetch }));

import { createSwapRequest, listSwapCandidates } from "./swap-api";

const jsonResp = (body: unknown, status = 200): Response =>
	({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	}) as unknown as Response;

afterEach(() => vi.clearAllMocks());

describe("swap-api", () => {
	it("passes assignment_id when listing candidates", async () => {
		mocks.authedFetch.mockResolvedValueOnce(jsonResp([{ id: "c1", work_date: "2026-09-03" }]));

		const rows = await listSwapCandidates("a1");

		const calledUrl = String(mocks.authedFetch.mock.calls[0][0]);
		expect(calledUrl).toContain("assignment_id=a1");
		expect(rows).toHaveLength(1);
	});

	it("surfaces the RFC 7807 detail message on a rejected swap", async () => {
		mocks.authedFetch.mockResolvedValueOnce(
			jsonResp(
				{ detail: "E1 is already rostered on 2026-09-03 (Day). Swap not possible." },
				400,
			),
		);

		await expect(
			createSwapRequest({
				requesterAssignmentId: "a1",
				counterpartyAssignmentId: "a2",
				reason: "",
			}),
		).rejects.toThrow(/already rostered on 2026-09-03/);
	});

	it("sends POST with snake_case body", async () => {
		mocks.authedFetch.mockResolvedValueOnce(jsonResp({ id: "sr1", status: "pending" }));

		await createSwapRequest({
			requesterAssignmentId: "assign-aaa",
			counterpartyAssignmentId: "assign-bbb",
			reason: "covering for leave",
		});

		const [calledUrl, calledInit] = mocks.authedFetch.mock.calls[0] as [string, RequestInit];
		expect(calledUrl).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/schedule/swap-requests/`);
		expect(calledInit.method).toBe("POST");
		const body = JSON.parse(calledInit.body as string);
		expect(body).toEqual({
			requester_assignment: "assign-aaa",
			counterparty_assignment: "assign-bbb",
			reason: "covering for leave",
		});
	});
});
