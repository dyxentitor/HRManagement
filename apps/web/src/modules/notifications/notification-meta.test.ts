import { describe, expect, it } from "vitest"

import { notificationDescription, priorityTone } from "./notification-meta"

const n = (over: Record<string, unknown> = {}) =>
  ({
    id: 1,
    type: "announcement.published",
    channel: "in_app",
    payload: { title: "Holiday" },
    deep_link: "",
    priority: "low",
    delivery_status: "pending",
    read_at: null,
    created_at: "2026-07-06T00:00:00Z",
    ...over,
  }) as never

describe("notification-meta", () => {
  it("priorityTone maps urgent/high/normal/low to distinct classes", () => {
    const tones = ["urgent", "high", "normal", "low"].map((p) => priorityTone(p))
    expect(new Set(tones).size).toBe(4)
  })

  it("description reads payload.title when present", () => {
    expect(notificationDescription(n())).toContain("Holiday")
  })

  it("description is empty when no known key", () => {
    expect(notificationDescription(n({ payload: {} }))).toBe("")
  })
})
