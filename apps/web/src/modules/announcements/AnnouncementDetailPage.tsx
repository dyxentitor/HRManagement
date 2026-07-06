import { ArrowLeft, Download, Megaphone, Paperclip } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { EmptyState, StatusPill } from "@/components/hrms"
import { Skeleton } from "@/components/ui/skeleton"

import { CATEGORY_LABELS, PRIORITY_LABELS, categoryTone, priorityTone } from "./announcement-meta"
import { type Announcement, announcementsApi } from "./api"

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [ann, setAnn] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    announcementsApi
      .get(id)
      .then((a) => {
        if (alive) setAnn(a)
      })
      .catch(() => {
        if (alive) setNotFound(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    // Mark read on open (best-effort).
    announcementsApi.markRead(id).catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  async function download(aid: number) {
    if (!id) return
    try {
      const url = await announcementsApi.attachmentUrl(id, aid)
      window.open(url, "_blank", "noopener")
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return <Skeleton className="h-40 w-full max-w-2xl" />
  }
  if (notFound || !ann) {
    return (
      <EmptyState
        icon={<Megaphone className="size-5" />}
        title="Announcement not found"
        description="It may have been archived or removed."
      />
    )
  }

  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <Link
        to="/announcements"
        className="inline-flex items-center gap-1 text-small text-accent-300 hover:text-accent-200"
      >
        <ArrowLeft className="size-4" /> Back to announcements
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={categoryTone(ann.category)} label={CATEGORY_LABELS[ann.category]} />
        <StatusPill tone={priorityTone(ann.priority)} label={PRIORITY_LABELS[ann.priority]} />
      </div>
      <div>
        <h1 className="text-h2 text-text-primary">{ann.title}</h1>
        {ann.published_at && (
          <p className="text-small text-text-tertiary">
            Published {new Date(ann.published_at).toLocaleDateString("en-MY")}
          </p>
        )}
      </div>
      <p className="whitespace-pre-wrap text-body text-text-secondary">{ann.body}</p>

      {ann.attachments.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <h3 className="flex items-center gap-1.5 text-label uppercase text-text-tertiary">
            <Paperclip className="size-3.5" /> Attachments
          </h3>
          <ul className="flex flex-col gap-1.5">
            {ann.attachments.map((att) => (
              <li key={att.id}>
                <button
                  type="button"
                  onClick={() => download(att.id)}
                  className="inline-flex items-center gap-2 rounded-md text-small text-accent-300 hover:text-accent-200"
                >
                  <Download className="size-4" /> {att.filename}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
