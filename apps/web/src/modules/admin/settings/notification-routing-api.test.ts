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

  // A 403 really does come back as a bare `detail` (see the PermissionDenied
  // branch of common/exception_handler.py), so this shape stays.
  it("throws a readable error when listing fails with a 403", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: undefined,
      error: {
        type: "about:blank",
        title: "Permission denied",
        status: 403,
        detail: "You do not have permission to perform this action.",
      },
    })
    await expect(notificationRoutingApi.list()).rejects.toThrow(
      "You do not have permission to perform this action.",
    )
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
      body: [
        {
          type: "leave.approved",
          in_app_enabled: true,
          email_enabled: true,
          delivery: "auto",
          cc_entries: ["hr@provintell.com"],
        },
      ],
    })
    expect(rows[0].type).toBe("leave.approved")
  })

  // The 400 envelope the server actually produces: `detail` is a fixed
  // constant, the real sentence lives in errors[0].message. Reading `detail`
  // first would render every message this module writes as boilerplate.
  it("prefers errors[0].message over the constant detail on a 400", async () => {
    mockedApi.PUT.mockResolvedValueOnce({
      data: undefined,
      error: {
        type: "about:blank",
        title: "Validation failed",
        status: 400,
        detail: "One or more fields failed validation.",
        errors: [
          {
            field: "delivery",
            code: "invalid",
            message:
              "A digest bundles unrelated notifications, so it cannot carry a CC. " +
              "Use Auto or Immediate, or clear the CC list.",
          },
        ],
      },
    })
    await expect(notificationRoutingApi.save([])).rejects.toThrow(
      /A digest bundles unrelated notifications/,
    )
  })

  it("surfaces a per-entry CC validation message", async () => {
    mockedApi.PUT.mockResolvedValueOnce({
      data: undefined,
      error: {
        type: "about:blank",
        title: "Validation failed",
        status: 400,
        detail: "One or more fields failed validation.",
        errors: [
          {
            field: "cc_entries",
            code: "invalid",
            message: "not-an-email: Enter a valid email address.",
          },
        ],
      },
    })
    await expect(notificationRoutingApi.save([])).rejects.toThrow(
      "not-an-email: Enter a valid email address.",
    )
  })

  it("falls back to the supplied message when the error carries neither field", async () => {
    mockedApi.PUT.mockResolvedValueOnce({ data: undefined, error: {} })
    await expect(notificationRoutingApi.save([])).rejects.toThrow(
      "Failed to save notification routing",
    )
  })
})
