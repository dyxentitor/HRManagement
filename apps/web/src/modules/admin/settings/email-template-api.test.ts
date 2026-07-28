import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  api: {
    GET: vi.fn(),
    PATCH: vi.fn(),
    POST: vi.fn(),
    DELETE: vi.fn(),
  },
}))

import { api } from "@/lib/api"
import { emailTemplateApi } from "./email-template-api"

const mockedApi = api as unknown as {
  GET: ReturnType<typeof vi.fn>
  PATCH: ReturnType<typeof vi.fn>
  POST: ReturnType<typeof vi.fn>
  DELETE: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("emailTemplateApi.list", () => {
  it("GETs the list endpoint and returns summaries", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: [
        { key: "leave_approved", label: "Leave Approved", has_override: false },
        { key: "claim_approved", label: "Claim Approved", has_override: true },
      ],
      error: undefined,
    })
    const result = await emailTemplateApi.list()
    expect(mockedApi.GET).toHaveBeenCalledWith("/api/v1/org/email-templates/")
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe("leave_approved")
    expect(result[1].has_override).toBe(true)
  })

  it("throws on error", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Forbidden" },
    })
    await expect(emailTemplateApi.list()).rejects.toThrow("Forbidden")
  })
})

describe("emailTemplateApi.get", () => {
  it("GETs detail endpoint with path param", async () => {
    const detail = {
      key: "leave_approved",
      subject: "Your leave is approved",
      text_body: "Hello {{name}}",
      html_body: "<p>Hello {{name}}</p>",
      has_override: false,
      placeholders: [{ name: "name", description: "Employee name", sample: "Alice" }],
    }
    mockedApi.GET.mockResolvedValueOnce({ data: detail, error: undefined })
    const result = await emailTemplateApi.get("leave_approved")
    expect(mockedApi.GET).toHaveBeenCalledWith("/api/v1/org/email-templates/{key}/", {
      params: { path: { key: "leave_approved" } },
    })
    expect(result.key).toBe("leave_approved")
    expect(result.placeholders).toHaveLength(1)
  })

  it("throws on error", async () => {
    mockedApi.GET.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Not found" },
    })
    await expect(emailTemplateApi.get("missing")).rejects.toThrow("Not found")
  })
})

describe("emailTemplateApi.save", () => {
  it("PATCHes with key path param and body", async () => {
    const saved = {
      key: "leave_approved",
      subject: "Custom subject",
      text_body: "Custom text",
      html_body: "<p>Custom</p>",
      has_override: true,
      placeholders: [],
    }
    mockedApi.PATCH.mockResolvedValueOnce({ data: saved, error: undefined })
    const body = { subject: "Custom subject", text_body: "Custom text", html_body: "<p>Custom</p>" }
    const result = await emailTemplateApi.save("leave_approved", body)
    expect(mockedApi.PATCH).toHaveBeenCalledWith("/api/v1/org/email-templates/{key}/", {
      params: { path: { key: "leave_approved" } },
      body: expect.objectContaining({ subject: "Custom subject" }),
    })
    expect(result.has_override).toBe(true)
  })

  it("throws on error", async () => {
    mockedApi.PATCH.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Validation error" },
    })
    await expect(
      emailTemplateApi.save("leave_approved", {
        subject: "x",
        text_body: "y",
        html_body: "z",
      }),
    ).rejects.toThrow("Validation error")
  })
})

describe("emailTemplateApi.reset", () => {
  it("DELETEs with key path param", async () => {
    mockedApi.DELETE.mockResolvedValueOnce({ error: undefined })
    await emailTemplateApi.reset("leave_approved")
    expect(mockedApi.DELETE).toHaveBeenCalledWith("/api/v1/org/email-templates/{key}/", {
      params: { path: { key: "leave_approved" } },
    })
  })

  it("throws on error", async () => {
    mockedApi.DELETE.mockResolvedValueOnce({ error: { detail: "Not found" } })
    await expect(emailTemplateApi.reset("missing")).rejects.toThrow("Not found")
  })
})

describe("emailTemplateApi.preview", () => {
  it("POSTs to preview endpoint with key and body", async () => {
    const preview = { subject: "Preview subject", text: "Preview text", html: "<p>Preview</p>" }
    mockedApi.POST.mockResolvedValueOnce({ data: preview, error: undefined })
    const result = await emailTemplateApi.preview("leave_approved", {
      subject: "Draft subject",
    })
    expect(mockedApi.POST).toHaveBeenCalledWith(
      "/api/v1/org/email-templates/{key}/preview/",
      expect.objectContaining({
        params: { path: { key: "leave_approved" } },
      }),
    )
    expect(result.subject).toBe("Preview subject")
    expect(result.html).toBe("<p>Preview</p>")
  })

  it("throws on error", async () => {
    mockedApi.POST.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Template render error" },
    })
    await expect(emailTemplateApi.preview("bad_key", {})).rejects.toThrow("Template render error")
  })
})

describe("emailTemplateApi.sendTest", () => {
  it("POSTs to send-test-email with recipient and template_key", async () => {
    const testResult = { success: true, message: "Email sent", detail: "" }
    mockedApi.POST.mockResolvedValueOnce({ data: testResult, error: undefined })
    const result = await emailTemplateApi.sendTest("leave_approved", "alice@example.com")
    expect(mockedApi.POST).toHaveBeenCalledWith(
      "/api/v1/org/email-config/send-test-email/",
      expect.objectContaining({
        body: expect.objectContaining({
          recipient: "alice@example.com",
          template_key: "leave_approved",
        }),
      }),
    )
    expect(result.success).toBe(true)
  })

  it("throws on error", async () => {
    mockedApi.POST.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "SMTP failure" },
    })
    await expect(emailTemplateApi.sendTest("leave_approved", "bad@example.com")).rejects.toThrow(
      "SMTP failure",
    )
  })
})
