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

function fail(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "detail" in error)
    throw new Error(String((error as { detail: unknown }).detail))
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
