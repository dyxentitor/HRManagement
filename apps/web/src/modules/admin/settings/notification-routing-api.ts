import { api } from "@/lib/api"

export type DeliveryMode = "auto" | "immediate" | "digest"

export interface RoutingToken {
  token: string
  label: string
}

export interface RoutingRow {
  type: string
  label: string
  domain: string
  domain_label: string
  security: boolean
  sensitive_content: boolean
  /**
   * The registry's per-user email default. When false, `seed_for_user()` writes
   * an explicit opt-out for every user, so a CC configured on this type will
   * usually never send — the CC rides the To-recipient's email row, which is
   * not created when they have the type switched off.
   */
  email_default: boolean
  in_app_enabled: boolean
  email_enabled: boolean
  delivery: DeliveryMode
  cc_entries: string[]
  available_tokens: RoutingToken[]
}

export interface RoutingWriteRow {
  type: string
  in_app_enabled: boolean
  email_enabled: boolean
  delivery: DeliveryMode
  cc_entries: string[]
}

// The RFC 7807 handler (common/exception_handler.py) sets `detail` to the
// constant "One or more fields failed validation." for every 400 and puts the
// real sentence in `errors[0].message`. Reading `detail` first would render
// every message this module writes as generic boilerplate — the same bug
// v1.10.1 fixed on leave-apply. A 403 does return a meaningful bare `detail`,
// so that stays as the fallback.
function fail(error: unknown, fallback: string): never {
  if (error && typeof error === "object") {
    const body = error as { detail?: unknown; errors?: Array<{ message?: unknown }> }
    const first = body.errors?.[0]?.message
    if (typeof first === "string" && first) throw new Error(first)
    if (body.detail) throw new Error(String(body.detail))
  }
  throw new Error(fallback)
}

export const notificationRoutingApi = {
  list: async (): Promise<RoutingRow[]> => {
    const { data, error } = await api.GET("/api/v1/org/notification-routing/")
    if (error) fail(error, "Failed to load notification routing")
    return data as unknown as RoutingRow[]
  },

  save: async (rows: RoutingWriteRow[]): Promise<RoutingRow[]> => {
    const { data, error } = await api.PUT("/api/v1/org/notification-routing/", {
      body: rows as never,
    })
    if (error) fail(error, "Failed to save notification routing")
    return data as unknown as RoutingRow[]
  },
}
