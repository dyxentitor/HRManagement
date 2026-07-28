import { api } from "@/lib/api"

export interface EmailTemplateSummary {
  key: string
  label: string
  has_override: boolean
}

export interface Placeholder {
  name: string
  description: string
  sample: string
}

export interface EmailTemplateDetail {
  key: string
  subject: string
  text_body: string
  html_body: string
  has_override: boolean
  placeholders: Placeholder[]
}

export interface RenderedPreview {
  subject: string
  text: string
  html: string
}

function fail(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "detail" in error)
    throw new Error(String((error as { detail: unknown }).detail))
  throw new Error(fallback)
}

export const emailTemplateApi = {
  list: async (): Promise<EmailTemplateSummary[]> => {
    const { data, error } = await api.GET("/api/v1/org/email-templates/")
    if (error) fail(error, "Failed to load email templates")
    return data as unknown as EmailTemplateSummary[]
  },

  get: async (key: string): Promise<EmailTemplateDetail> => {
    const { data, error } = await api.GET("/api/v1/org/email-templates/{key}/", {
      params: { path: { key } },
    })
    if (error) fail(error, "Failed to load email template")
    return data as unknown as EmailTemplateDetail
  },

  save: async (
    key: string,
    body: { subject: string; text_body: string; html_body: string },
  ): Promise<EmailTemplateDetail> => {
    const { data, error } = await api.PATCH("/api/v1/org/email-templates/{key}/", {
      params: { path: { key } },
      body: body as never,
    })
    if (error) fail(error, "Failed to save email template")
    return data as unknown as EmailTemplateDetail
  },

  reset: async (key: string): Promise<void> => {
    const { error } = await api.DELETE("/api/v1/org/email-templates/{key}/", {
      params: { path: { key } },
    })
    if (error) fail(error, "Failed to reset email template")
  },

  preview: async (
    key: string,
    body: { subject?: string; text_body?: string; html_body?: string },
  ): Promise<RenderedPreview> => {
    const { data, error } = await api.POST("/api/v1/org/email-templates/{key}/preview/", {
      params: { path: { key } },
      body: body as never,
    })
    if (error) fail(error, "Failed to generate preview")
    return data as unknown as RenderedPreview
  },

  sendTest: async (
    key: string,
    recipient: string,
  ): Promise<{ success: boolean; message: string; detail: string }> => {
    const { data, error } = await api.POST("/api/v1/org/email-config/send-test-email/", {
      body: { recipient, template_key: key } as never,
    })
    if (error) fail(error, "Failed to send test email")
    return data as unknown as { success: boolean; message: string; detail: string }
  },
}
