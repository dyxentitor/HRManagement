import { api } from "@/lib/api"

export type AnnouncementCategory = "policy" | "event" | "maintenance" | "holiday" | "general"
export type AnnouncementPriority = "low" | "normal" | "high"
export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived"
export type AudienceType = "all" | "departments" | "roles" | "teams" | "employees"

export interface AnnouncementAttachmentMeta {
  id: number
  filename: string
  content_type: string
  size_bytes: number
}

export interface Announcement {
  id: string
  title: string
  body: string
  category: AnnouncementCategory
  priority: AnnouncementPriority
  status: AnnouncementStatus
  pinned: boolean
  published_at: string | null
  scheduled_at: string | null
  expires_at: string | null
  audience_type: AudienceType
  audience_spec: string[]
  created_by: string | null
  created_at: string
  is_read: boolean
  attachments: AnnouncementAttachmentMeta[]
}

export interface AnnouncementWrite {
  title: string
  body: string
  category: AnnouncementCategory
  priority: AnnouncementPriority
  pinned: boolean
  expires_at?: string | null
  scheduled_at?: string | null
  audience_type: AudienceType
  audience_spec: string[]
  publish_now?: boolean
}

export interface FeedParams {
  search?: string
  category?: AnnouncementCategory
  priority?: AnnouncementPriority
  unread_only?: boolean
  pinned?: boolean
}

function fail(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "detail" in error)
    throw new Error(String((error as { detail: unknown }).detail))
  throw new Error(fallback)
}

export const announcementsApi = {
  feed: async (params: FeedParams = {}): Promise<Announcement[]> => {
    const query: Record<string, string> = {}
    if (params.search) query.search = params.search
    if (params.category) query.category = params.category
    if (params.priority) query.priority = params.priority
    if (params.unread_only) query.unread_only = "true"
    if (params.pinned) query.pinned = "true"
    const { data, error } = await api.GET("/api/v1/announcements/feed/", {
      params: { query } as never,
    })
    if (error) fail(error, "Failed to load announcements")
    return (data ?? []) as unknown as Announcement[]
  },

  unreadCount: async (): Promise<number> => {
    const { data, error } = await api.GET("/api/v1/announcements/unread-count/")
    if (error) fail(error, "Failed to load unread count")
    return (data as unknown as { count: number }).count
  },

  get: async (id: string): Promise<Announcement> => {
    const { data, error } = await api.GET("/api/v1/announcements/{id}/", {
      params: { path: { id } },
    })
    if (error) fail(error, "Failed to load announcement")
    return data as unknown as Announcement
  },

  markRead: async (id: string): Promise<void> => {
    const { error } = await api.POST("/api/v1/announcements/{id}/read/", {
      params: { path: { id } },
      body: {} as never,
    })
    if (error) fail(error, "Failed to mark read")
  },

  readAll: async (): Promise<void> => {
    const { error } = await api.POST("/api/v1/announcements/read-all/", { body: {} as never })
    if (error) fail(error, "Failed to mark all read")
  },

  manageList: async (status?: AnnouncementStatus): Promise<Announcement[]> => {
    const query = status ? { status } : {}
    const { data, error } = await api.GET("/api/v1/announcements/", {
      params: { query } as never,
    })
    if (error) fail(error, "Failed to load announcements")
    const body = (data ?? []) as unknown as Announcement[] | { results: Announcement[] }
    return Array.isArray(body) ? body : (body.results ?? [])
  },

  create: async (payload: AnnouncementWrite): Promise<Announcement> => {
    const { data, error } = await api.POST("/api/v1/announcements/", { body: payload as never })
    if (error) fail(error, "Failed to create announcement")
    return data as unknown as Announcement
  },

  update: async (id: string, payload: Partial<AnnouncementWrite>): Promise<Announcement> => {
    const { data, error } = await api.PATCH("/api/v1/announcements/{id}/", {
      params: { path: { id } },
      body: payload as never,
    })
    if (error) fail(error, "Failed to update announcement")
    return data as unknown as Announcement
  },

  publish: async (id: string): Promise<Announcement> => {
    const { data, error } = await api.POST("/api/v1/announcements/{id}/publish/", {
      params: { path: { id } },
      body: {} as never,
    })
    if (error) fail(error, "Failed to publish")
    return data as unknown as Announcement
  },

  archive: async (id: string): Promise<Announcement> => {
    const { data, error } = await api.POST("/api/v1/announcements/{id}/archive/", {
      params: { path: { id } },
      body: {} as never,
    })
    if (error) fail(error, "Failed to archive")
    return data as unknown as Announcement
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await api.DELETE("/api/v1/announcements/{id}/", {
      params: { path: { id } },
    })
    if (error) fail(error, "Failed to delete announcement")
  },

  presignAttachment: async (
    id: string,
    filename: string,
    content_type: string,
  ): Promise<{ presigned_url: string; s3_key: string }> => {
    const { data, error } = await api.POST(
      "/api/v1/announcements/{id}/attachments/presigned-upload/",
      { params: { path: { id } }, body: { filename, content_type } as never },
    )
    if (error) fail(error, "Failed to presign upload")
    return data as unknown as { presigned_url: string; s3_key: string }
  },

  registerAttachment: async (
    id: string,
    meta: { filename: string; content_type: string; size_bytes: number; s3_key: string },
  ): Promise<void> => {
    const { error } = await api.POST("/api/v1/announcements/{id}/attachments/", {
      params: { path: { id } },
      body: meta as never,
    })
    if (error) fail(error, "Failed to register attachment")
  },

  attachmentUrl: async (id: string, aid: number): Promise<string> => {
    const { data, error } = await api.GET(
      "/api/v1/announcements/{id}/attachments/{aid}/download/",
      { params: { path: { id, aid } } as never },
    )
    if (error) fail(error, "Failed to get download URL")
    return (data as unknown as { url: string }).url
  },
}
