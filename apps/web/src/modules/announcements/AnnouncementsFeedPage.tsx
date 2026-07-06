import { Megaphone, Pin, Search, Settings2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { EmptyState, StatusPill } from "@/components/hrms"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"

import { CATEGORY_LABELS, PRIORITY_LABELS, categoryTone, priorityTone } from "./announcement-meta"
import { type Announcement, type FeedParams, announcementsApi } from "./api"

const CATEGORIES = ["policy", "event", "maintenance", "holiday", "general"] as const
const PRIORITIES = ["high", "normal", "low"] as const

export default function AnnouncementsFeedPage() {
  const canRead = useCan("announcement:read")
  const canManage = useCan("announcement:write")
  const navigate = useNavigate()
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filters, setFilters] = useState<FeedParams>({})

  const load = useCallback(async () => {
    if (!canRead) return
    setLoading(true)
    try {
      setItems(await announcementsApi.feed(filters))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [canRead, filters])

  useEffect(() => {
    load()
  }, [load])

  if (!canRead) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Announcements" />
        <p className="text-text-tertiary">You don't have access to announcements.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Announcements"
        subtitle="Company news and updates."
        actions={
          canManage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/announcements/manage")}
            >
              <Settings2 className="size-4" /> Manage announcements
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-canvas px-3 py-1.5">
          <Search className="size-3.5 text-text-tertiary" aria-hidden />
          <input
            type="search"
            aria-label="Search announcements"
            placeholder="Search…"
            value={filters.search ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
            className="w-40 bg-transparent text-small text-text-secondary focus:outline-none"
          />
        </div>
        <FilterSelect
          label="Category"
          value={filters.category ?? ""}
          onChange={(v) =>
            setFilters((f) => ({ ...f, category: (v || undefined) as FeedParams["category"] }))
          }
          options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
        />
        <FilterSelect
          label="Priority"
          value={filters.priority ?? ""}
          onChange={(v) =>
            setFilters((f) => ({ ...f, priority: (v || undefined) as FeedParams["priority"] }))
          }
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
        />
        <button
          type="button"
          onClick={() =>
            setFilters((f) => ({ ...f, unread_only: f.unread_only ? undefined : true }))
          }
          className={cn(
            "rounded-full border px-3 py-1.5 text-small transition-colors",
            filters.unread_only
              ? "border-accent-500 bg-accent-500/10 text-text-primary"
              : "border-border-subtle text-text-secondary hover:border-border-strong",
          )}
        >
          Unread only
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="text-coral text-small">Couldn't load announcements.</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="No announcements"
          description="Nothing to show with the current filters."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => navigate(`/announcements/${a.id}`)}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface p-4 text-left transition-colors hover:border-border-strong",
                  !a.is_read && "border-l-2 border-l-accent-500",
                )}
              >
                <div className="flex items-center gap-2">
                  {a.pinned && <Pin className="size-3.5 text-accent-300" aria-label="pinned" />}
                  <span
                    className={cn(
                      "flex-1 truncate text-body",
                      a.is_read ? "text-text-primary" : "font-semibold text-text-primary",
                    )}
                  >
                    {a.title}
                  </span>
                  {!a.is_read && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-accent-500"
                      aria-label="unread"
                    />
                  )}
                </div>
                <p className="line-clamp-2 text-small text-text-secondary">{a.body}</p>
                <div className="flex items-center gap-2">
                  <StatusPill tone={categoryTone(a.category)} label={CATEGORY_LABELS[a.category]} />
                  <StatusPill tone={priorityTone(a.priority)} label={PRIORITY_LABELS[a.priority]} />
                  {a.published_at && (
                    <span className="text-small text-text-tertiary">
                      {new Date(a.published_at).toLocaleDateString("en-MY")}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-border-subtle bg-canvas px-3 py-1.5 text-small text-text-secondary focus:outline-none"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
