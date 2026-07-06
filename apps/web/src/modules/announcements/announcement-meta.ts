import type { AnnouncementCategory, AnnouncementPriority, AnnouncementStatus } from "./api"

type Tone = "mint" | "yellow" | "coral" | "sky" | "lavender" | "peach"

const CATEGORY_TONE: Record<AnnouncementCategory, Tone> = {
  policy: "lavender",
  event: "sky",
  maintenance: "yellow",
  holiday: "mint",
  general: "peach",
}

const PRIORITY_TONE: Record<AnnouncementPriority, Tone> = {
  low: "sky",
  normal: "lavender",
  high: "coral",
}

const STATUS_TONE: Record<AnnouncementStatus, Tone> = {
  draft: "yellow",
  scheduled: "sky",
  published: "mint",
  archived: "coral",
}

export const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  policy: "Policy",
  event: "Event",
  maintenance: "Maintenance",
  holiday: "Holiday",
  general: "General",
}

export const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
}

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
}

export function categoryTone(c: AnnouncementCategory): Tone {
  return CATEGORY_TONE[c] ?? "peach"
}

export function priorityTone(p: AnnouncementPriority): Tone {
  return PRIORITY_TONE[p] ?? "lavender"
}

export function statusTone(s: AnnouncementStatus): Tone {
  return STATUS_TONE[s] ?? "lavender"
}
