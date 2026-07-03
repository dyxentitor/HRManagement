import { api } from "@/lib/api"

import type { EmailConfigForm } from "./email-config-validation"

export interface EmailConfig extends EmailConfigForm {
  has_password: boolean
  last_test_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  last_failure_message: string
  updated_at: string
}

export interface TestResult {
  success: boolean
  message: string
  detail: string
}

function fail(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "detail" in error)
    throw new Error(String((error as { detail: unknown }).detail))
  throw new Error(fallback)
}

export const emailConfigApi = {
  get: async (): Promise<EmailConfig> => {
    const { data, error } = await api.GET("/api/v1/org/email-config/")
    if (error) fail(error, "Failed to load email configuration")
    return data as unknown as EmailConfig
  },

  patch: async (payload: Partial<EmailConfigForm>): Promise<EmailConfig> => {
    const { data, error } = await api.PATCH("/api/v1/org/email-config/", {
      body: payload as never,
    })
    if (error) fail(error, "Failed to save email configuration")
    return data as unknown as EmailConfig
  },

  testConnection: async (payload: Partial<EmailConfigForm>): Promise<TestResult> => {
    const { data, error } = await api.POST("/api/v1/org/email-config/test-connection/", {
      body: payload as never,
    })
    if (error) fail(error, "Connection test failed")
    return data as unknown as TestResult
  },

  sendTestEmail: async (
    recipient: string,
    payload: Partial<EmailConfigForm>,
  ): Promise<TestResult> => {
    const { data, error } = await api.POST("/api/v1/org/email-config/send-test-email/", {
      body: { recipient, ...payload } as never,
    })
    if (error) fail(error, "Failed to send test email")
    return data as unknown as TestResult
  },
}
