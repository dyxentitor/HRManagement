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
					permissions: [],
					member_count: 1,
				},
			],
			error: undefined,
		});
		const result = await roleApi.list();
		expect(result).toHaveLength(1);
		expect(result[0].code).toBe("org_admin");
	});

	it("retrieve fetches single role with permissions", async () => {
		mockedApi.GET.mockResolvedValueOnce({
			data: {
				code: "manager",
				name: "Manager",
				is_system: true,
				permissions: ["leave:approve:team"],
				member_count: 3,
			},
			error: undefined,
		});
		const r = await roleApi.retrieve("manager");
		expect(r.permissions).toEqual(["leave:approve:team"]);
	});

	it("setPermissions PATCHes and returns updated role", async () => {
		mockedApi.PATCH.mockResolvedValueOnce({
			data: {
				code: "team_lead",
				name: "Team Lead",
				is_system: true,
				permissions: ["leave:approve:team", "claim:approve:team"],
				member_count: 2,
			},
			error: undefined,
		});
		const r = await roleApi.setPermissions("team_lead", [
			"leave:approve:team",
			"claim:approve:team",
		]);
		expect(r.permissions).toContain("claim:approve:team");
	});

	it("reset POSTs to defaults endpoint", async () => {
		mockedApi.POST.mockResolvedValueOnce({
			data: {
				code: "team_lead",
				name: "Team Lead",
				is_system: true,
				permissions: [],
				member_count: 2,
			},
			error: undefined,
		});
		await roleApi.reset("team_lead");
		expect(mockedApi.POST).toHaveBeenCalled();
	});
});

describe("userRolesApi", () => {
	it("assign sends PATCH with role_codes", async () => {
		mockedApi.PATCH.mockResolvedValueOnce({
			data: { id: "u-1", roles: ["manager"] },
			error: undefined,
		});
		const r = await userRolesApi.assign("u-1", ["manager"]);
		expect(r.roles).toEqual(["manager"]);
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
