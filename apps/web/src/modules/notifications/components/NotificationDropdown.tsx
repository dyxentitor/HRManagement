import { Bell } from "lucide-react"

import { EmptyState } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import type { Notification } from "../api"
import { useNotifications } from "../useNotifications"
import { NotificationRow } from "./NotificationRow"

export interface TimeGroups {
  today: Notification[]
  yesterday: Notification[]
  earlier: Notification[]
}

/** Bucket notifications into Today / Yesterday / Earlier by local calendar day. */
export function groupByTime(items: Notification[], now: Date = new Date()): TimeGroups {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000
  const groups: TimeGroups = { today: [], yesterday: [], earlier: [] }
  for (const n of items) {
    const t = new Date(n.created_at).getTime()
    if (t >= startOfToday) groups.today.push(n)
    else if (t >= startOfYesterday) groups.yesterday.push(n)
    else groups.earlier.push(n)
  }
  return groups
}

const GROUP_LABELS: [keyof TimeGroups, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["earlier", "Earlier"],
]

export function NotificationDropdown({ onNavigate }: { onNavigate: (path: string) => void }) {
  const {
    items,
    unreadCount,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    markOneRead,
    markAll,
  } = useNotifications()

  async function handleRow(n: Notification) {
    await markOneRead(n.id)
    if (n.deep_link) onNavigate(n.deep_link)
  }

  function handleMarkRead(n: Notification) {
    void markOneRead(n.id)
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      loadMore()
    }
  }

  const groups = groupByTime(items)

  return (
    <div className="flex w-[min(24rem,calc(100vw-2rem))] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body font-semibold text-text-primary">Notifications</span>
          {unreadCount > 0 && (
            <span
              role="status"
              aria-live="polite"
              aria-label={`${unreadCount} unread`}
              className="shrink-0 rounded-full bg-accent-500/15 px-1.5 py-0.5 text-center text-[11px] font-bold text-accent-200"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={markAll}
          disabled={unreadCount === 0}
          className="shrink-0 rounded-md text-small text-accent-300 transition-colors hover:text-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 disabled:text-text-disabled"
        >
          Mark all read
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <p className="text-small text-text-tertiary">Couldn't load notifications.</p>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<Bell className="size-5" />}
            title="You're all caught up"
            description="New notifications will show up here."
          />
        </div>
      ) : (
        <div onScroll={onScroll} className="max-h-[26rem] overflow-y-auto">
          {GROUP_LABELS.map(([key, label]) =>
            groups[key].length === 0 ? null : (
              <div key={key}>
                <div className="sticky top-0 z-10 bg-surface/95 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary backdrop-blur">
                  {label}
                </div>
                <div className="flex flex-col divide-y divide-border-subtle">
                  {groups[key].map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      onClick={handleRow}
                      onMarkRead={handleMarkRead}
                      onView={handleRow}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
          {loadingMore && (
            <p className="py-2 text-center text-small text-text-tertiary">Loading…</p>
          )}
        </div>
      )}

      <div className="border-t border-border-subtle px-4 py-2.5">
        <button
          type="button"
          onClick={() => onNavigate("/notifications/preferences")}
          className="text-small text-text-tertiary transition-colors hover:text-text-secondary"
        >
          Notification settings
        </button>
      </div>
    </div>
  )
}
