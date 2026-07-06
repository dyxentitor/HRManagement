import { cn } from "@/lib/utils"

import type { Notification } from "../api"
import { eventDomain, getEventLabel } from "../event-labels"

const DOMAIN_TONE: Record<string, string> = {
  leave: "bg-mint",
  claim: "bg-coral",
  cert: "bg-yellow",
  kpi: "bg-sky",
  auth: "bg-lavender",
  employee: "bg-peach",
  schedule: "bg-sky",
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification
  onClick: (n: Notification) => void
}) {
  const unread = !notification.read_at
  const tone = DOMAIN_TONE[eventDomain(notification.type)] ?? "bg-lavender"
  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover",
        unread && "bg-accent-500/[0.04]",
      )}
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-text-primary">
          {getEventLabel(notification.type)}
        </span>
        <span className="text-small text-text-tertiary">{timeAgo(notification.created_at)}</span>
      </span>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-500" aria-label="unread" />
      )}
    </button>
  )
}
