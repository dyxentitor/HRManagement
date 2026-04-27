import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use a mock fetch that we install BEFORE the module is loaded
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Dynamic imports so the module picks up the stubbed fetch
const { api } = await import("./api");
const { tokenStorage } = await import("./token-storage");

describe("api client", () => {
	beforeEach(() => {
		tokenStorage.clear();
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("attaches Authorization header when token is present", async () => {
		tokenStorage.set("test-access", "test-refresh"); // pragma: allowlist secret
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		// biome-ignore lint/suspicious/noExplicitAny: test-only path override
		await api.GET("/api/v1/auth/me" as any);
		const headers = (mockFetch.mock.calls[0][0] as Request).headers;
		expect(headers.get("Authorization")).toBe("Bearer test-access");
	});

	it("does not attach Authorization header when no token", async () => {
		mockFetch.mockResolvedValue(
			new Response("{}", {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		// biome-ignore lint/suspicious/noExplicitAny: test-only path override
		await api.GET("/api/v1/auth/me" as any);
		const headers = (mockFetch.mock.calls[0][0] as Request).headers;
		expect(headers.get("Authorization")).toBeNull();
	});
});
