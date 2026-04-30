import { api } from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { featureFlagApi, roleApi, userRolesApi } from "./api";

vi.mock("@/lib/api", () => ({
	api: {
		GET: vi.fn(),
		PATCH: vi.fn(),
		POST: vi.fn(),
	},
}));

const mockedApi = api as unknown as {
	GET: ReturnType<typeof vi.fn>;
	PATCH: ReturnType<typeof vi.fn>;
	POST: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("roleApi", () => {
	it("list returns array of roles", async () => {
		mockedApi.GET.mockResolvedValueOnce({
			data: [
				{
					code: "org_admin",
					name: "Org Admin",
					is_system: true,
					permission_count: 0,
					user_count: 1,
				},
			],
			error: undefined,
		});
		const result = await roleApi.list();
		expect(result).toHaveLength(1);
		expect(result[0].code).toBe("org_admin");
		expect(result[0].member_count).toBe(1);
	});

	it("retrieve fetches single role with permissions", async () => {
		mockedApi.GET.mockResolvedValueOnce({
			data: {
				code: "manager",
				name: "Manager",
				is_system: true,
				permission_codes: ["leave:approve:team"],
				user_count: 3,
			},
			error: undefined,
		});
		const r = await roleApi.retrieve("manager");
		expect(r.permissions).toEqual(["leave:approve:team"]);
		expect(r.member_count).toBe(3);
	});

	it("setPermissions PATCHes with permission_codes and returns updated role", async () => {
		mockedApi.PATCH.mockResolvedValueOnce({
			data: {
				code: "team_lead",
				name: "Team Lead",
				is_system: true,
				permission_codes: ["leave:approve:team", "claim:approve:team"],
				user_count: 2,
			},
			error: undefined,
		});
		const r = await roleApi.setPermissions("team_lead", [
			"leave:approve:team",
			"claim:approve:team",
		]);
		expect(r.permissions).toContain("claim:approve:team");
		expect(r.member_count).toBe(2);
		// Ensure body sent to backend uses permission_codes (not permissions)
		expect(mockedApi.PATCH).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: {
					permission_codes: ["leave:approve:team", "claim:approve:team"],
				},
			}),
		);
	});

	it("reset POSTs to defaults endpoint", async () => {
		mockedApi.POST.mockResolvedValueOnce({
			data: {
				code: "team_lead",
				name: "Team Lead",
				is_system: true,
				permission_codes: [],
				user_count: 2,
			},
			error: undefined,
		});
		await roleApi.reset("team_lead");
		expect(mockedApi.POST).toHaveBeenCalled();
	});

	// Regression test: backend field names must be translated at the boundary.
	// Before the fix, api.ts returned raw backend shapes so r.permissions was
	// undefined (backend uses permission_codes) and r.member_count was undefined
	// (backend uses user_count), causing a crash in AdminRoleDetailPage at
	// `new Set(r.permissions)`.
	it("retrieve aliases backend permission_codes→permissions and user_count→member_count", async () => {
		mockedApi.GET.mockResolvedValueOnce({
			data: {
				code: "auditor",
				name: "Auditor",
				is_system: true,
				permission_codes: ["audit:read:org", "attendance:read:org"],
				user_count: 3,
			},
			error: undefined,
		});
		const r = await roleApi.retrieve("auditor");
		// Frontend interface fields must be present
		expect(r.permissions).toEqual(["audit:read:org", "attendance:read:org"]);
		expect(r.member_count).toBe(3);
		// Backend field names must NOT leak through
		expect(
			(r as unknown as Record<string, unknown>).permission_codes,
		).toBeUndefined();
		expect(
			(r as unknown as Record<string, unknown>).user_count,
		).toBeUndefined();
	});
});

describe("userRolesApi", () => {
	it("assign sends PATCH with role_codes and maps response to frontend shape", async () => {
		mockedApi.PATCH.mockResolvedValueOnce({
			data: {
				user_id: "u-1",
				email: "test@example.com",
				role_codes: ["manager"],
				permissions: ["leave:approve:team"],
			},
			error: undefined,
		});
		const r = await userRolesApi.assign("u-1", ["manager"]);
		expect(r.roles).toEqual(["manager"]);
		expect(r.id).toBe("u-1");
		// Backend field names must NOT leak through
		expect((r as unknown as Record<string, unknown>).user_id).toBeUndefined();
		expect(
			(r as unknown as Record<string, unknown>).role_codes,
		).toBeUndefined();
	});
});

describe("featureFlagApi", () => {
	it("list returns flag array", async () => {
		mockedApi.GET.mockResolvedValueOnce({
			data: [
				{
					key: "leave",
					label: "Leave",
					enabled: true,
					critical: false,
					togglable: true,
					derived: false,
					depends_on: [],
				},
				{
					key: "claims",
					label: "Claims",
					enabled: false,
					critical: false,
					togglable: true,
					derived: false,
					depends_on: [],
				},
			],
			error: undefined,
		});
		const result = await featureFlagApi.list();
		expect(result).toHaveLength(2);
		expect(result[1].enabled).toBe(false);
	});

	it("setEnabled PATCHes single flag", async () => {
		mockedApi.PATCH.mockResolvedValueOnce({
			data: {
				key: "claims",
				label: "Claims",
				enabled: false,
				critical: false,
				togglable: true,
				derived: false,
				depends_on: [],
			},
			error: undefined,
		});
		const r = await featureFlagApi.setEnabled("claims", false);
		expect(r.enabled).toBe(false);
	});
});
