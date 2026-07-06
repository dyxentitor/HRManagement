import { ArrowUpRight, Check } from "lucide-react"

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

const actionBtn =
  "grid size-7 place-items-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"

export function NotificationRow({
  notification,
  onClick,
  onMarkRead,
  onView,
}: {
  notification: Notification
  onClick: (n: Notification) => void
  onMarkRead: (n: Notification) => void
  onView: (n: Notification) => void
}) {
  const unread = !notification.read_at
  const Icon = domainIcon(notification.type)
  const tone = priorityTone(notification.priority)
  const description = notificationDescription(notification)
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 py-2.5 pl-4 pr-3 transition-colors",
        "hover:bg-surface-hover",
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
      {/* main clickable region (mark read + navigate) */}
      <button
        type="button"
        onClick={() => onClick(notification)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
      >
        <span
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-hover text-text-secondary group-hover:text-text-primary"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
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
      </button>

      {/* right slot: unread dot morphs into quick actions on hover/focus */}
      <div className="relative flex w-[52px] shrink-0 items-center justify-end self-center">
        {unread && (
          <span
            className={cn(
              "size-2 rounded-full bg-accent-500 transition-opacity",
              "group-hover:opacity-0 group-focus-within:opacity-0",
            )}
            aria-label="unread"
          />
        )}
        <div
          className={cn(
            "absolute right-0 flex items-center gap-1 opacity-0 transition-opacity",
            "group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          {unread && (
            <button
              type="button"
              aria-label="Mark as read"
              title="Mark as read"
              onClick={() => onMarkRead(notification)}
              className={actionBtn}
            >
              <Check className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="View details"
            title="View details"
            onClick={() => onView(notification)}
            className={actionBtn}
          >
            <ArrowUpRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
