import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  api: {
    GET: vi.fn(),
    PUT: vi.fn(),
  },
}))

import { api } from "@/lib/api"
import { notificationRoutingApi } from "./notification-routing-api"

const mockedApi = api as unknown as {
  GET: ReturnType<typeof vi.fn>
  PUT: ReturnType<typeof vi.fn>
}

const ROW = {
  type: "leave.approved",
  label: "Leave request approved",
  domain: "leave",
  domain_label: "Leave",
  security: false,
  sensitive_content: true,
  in_app_enabled: true,
  email_enabled: true,
  delivery: "auto",
  cc_entries: ["hr@provintell.com"],
  available_tokens: [{ token: "{approver}", label: "Approver" }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("notificationRoutingApi", () => {
  it("lists routing rows", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: [ROW],
      error: undefined,
    })
    const rows = await notificationRoutingApi.list()
    expect(mockedApi.GET).toHaveBeenCalledWith("/api/v1/org/notification-routing/")
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("leave.approved")
    expect(rows[0].cc_entries).toEqual(["hr@provintell.com"])
  })

  it("throws a readable error when listing fails", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Permission denied" },
    })
    await expect(notificationRoutingApi.list()).rejects.toThrow("Permission denied")
  })

  it("saves rows and returns the merged list", async () => {
    mockedApi.PUT.mockResolvedValueOnce({
      data: [ROW],
      error: undefined,
    })
    const rows = await notificationRoutingApi.save([
      {
        type: "leave.approved",
        in_app_enabled: true,
        email_enabled: true,
        delivery: "auto",
        cc_entries: ["hr@provintell.com"],
      },
    ])
    expect(mockedApi.PUT).toHaveBeenCalledWith("/api/v1/org/notification-routing/", {
      body: expect.arrayContaining([
        expect.objectContaining({
          type: "leave.approved",
          in_app_enabled: true,
          email_enabled: true,
          delivery: "auto",
          cc_entries: ["hr@provintell.com"],
        }),
      ]),
    })
    expect(rows[0].type).toBe("leave.approved")
  })

  it("surfaces a validation message when saving fails", async () => {
    mockedApi.PUT.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Invalid CC entry" },
    })
    await expect(notificationRoutingApi.save([])).rejects.toThrow("Invalid CC entry")
  })
})
