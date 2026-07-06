import { Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { StatusPill } from "@/components/hrms"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { useCan } from "@/lib/perm"

import { CATEGORY_LABELS, STATUS_LABELS, categoryTone, statusTone } from "./announcement-meta"
import { type Announcement, announcementsApi } from "./api"

export default function AnnouncementsManagePage() {
  const canWrite = useCan("announcement:write")
  const navigate = useNavigate()
  const [rows, setRows] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await announcementsApi.manageList())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canWrite) load()
  }, [canWrite, load])

  async function act(id: string, fn: () => Promise<unknown>, label: string) {
    setBusy(id)
    try {
      await fn()
      toast.success(label)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(null)
    }
  }

  if (!canWrite) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Manage Announcements" />
        <p className="text-text-tertiary">You don't have permission to manage announcements.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Manage Announcements"
        subtitle="Create, publish, schedule, and archive company announcements."
        actions={
          <Button type="button" onClick={() => navigate("/announcements/new")}>
            <Plus className="size-4" /> New
          </Button>
        }
      />

      {loading ? (
        <p className="text-text-secondary">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-tertiary">No announcements yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <table className="w-full text-body">
            <thead className="bg-surface-hover text-label uppercase text-text-tertiary">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((a) => (
                <tr key={a.id} className="bg-surface">
                  <td className="px-3 py-2 text-text-primary">{a.title}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      tone={categoryTone(a.category)}
                      label={CATEGORY_LABELS[a.category]}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={statusTone(a.status)} label={STATUS_LABELS[a.status]} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <RowBtn onClick={() => navigate(`/announcements/${a.id}/edit`)}>Edit</RowBtn>
                      {a.status !== "published" && (
                        <RowBtn
                          disabled={busy === a.id}
                          onClick={() =>
                            act(a.id, () => announcementsApi.publish(a.id), "Published")
                          }
                        >
                          Publish
                        </RowBtn>
                      )}
                      {a.status !== "archived" && (
                        <RowBtn
                          disabled={busy === a.id}
                          onClick={() =>
                            act(a.id, () => announcementsApi.archive(a.id), "Archived")
                          }
                        >
                          Archive
                        </RowBtn>
                      )}
                      <RowBtn
                        disabled={busy === a.id}
                        onClick={() => act(a.id, () => announcementsApi.remove(a.id), "Deleted")}
                      >
                        Delete
                      </RowBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RowBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-small text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
    >
      {children}
    </button>
  )
}
