import { Bell } from "lucide-react"

import { EmptyState } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import type { Notification } from "../api"
import { useNotifications } from "../useNotifications"
import { NotificationRow } from "./NotificationRow"

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

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      loadMore()
    }
  }

  return (
    <div className="flex w-80 flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
        <span className="text-body font-semibold text-text-primary">Notifications</span>
        <button
          type="button"
          onClick={markAll}
          disabled={unreadCount === 0}
          className="text-small text-accent-300 hover:text-accent-200 disabled:text-text-disabled"
        >
          Mark all read
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
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
        <div onScroll={onScroll} className="max-h-96 overflow-y-auto">
          <div className="flex flex-col divide-y divide-border-subtle">
            {items.map((n) => (
              <NotificationRow key={n.id} notification={n} onClick={handleRow} />
            ))}
          </div>
          {loadingMore && (
            <p className="py-2 text-center text-small text-text-tertiary">Loading…</p>
          )}
        </div>
      )}

      <div className="border-t border-border-subtle px-3 py-2">
        <button
          type="button"
          onClick={() => onNavigate("/notifications/preferences")}
          className="text-small text-text-tertiary hover:text-text-secondary"
        >
          Notification settings
        </button>
      </div>
    </div>
  )
}
