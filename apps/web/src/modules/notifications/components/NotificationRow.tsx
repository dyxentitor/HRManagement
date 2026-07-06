import { cn } from "@/lib/utils"

import type { Notification } from "../api"
import { getEventLabel } from "../event-labels"
import { domainIcon, notificationDescription, priorityTone } from "../notification-meta"

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
  const Icon = domainIcon(notification.type)
  const tone = priorityTone(notification.priority)
  const description = notificationDescription(notification)
  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={cn(
        "group relative flex w-full items-start gap-3 py-2.5 pl-4 pr-3 text-left transition-colors",
        "hover:bg-surface-hover motion-safe:transition-colors",
        unread && "bg-accent-500/[0.05]",
      )}
    >
      {/* priority rail */}
      <span
        className={cn(
          "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full",
          tone,
          !unread && "opacity-40",
        )}
        aria-hidden
      />
      {/* category icon */}
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          "bg-surface-hover text-text-secondary group-hover:text-text-primary",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      {/* body */}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-body",
            unread ? "font-semibold text-text-primary" : "text-text-primary",
          )}
        >
          {getEventLabel(notification.type)}
        </span>
        {description && (
          <span className="block truncate text-small text-text-secondary">{description}</span>
        )}
        <span className="text-small text-text-tertiary">{timeAgo(notification.created_at)}</span>
      </span>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-500" aria-label="unread" />
      )}
    </button>
  )
}
