import { MessageSquare } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/hrms"
import { PageHeader } from "@/components/shell/PageHeader"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCan } from "@/lib/perm"

import {
  type AdminUser,
  type FeedbackActivity,
  type FeedbackItem,
  type FeedbackNote,
  type FeedbackStatus,
  feedbackApi,
} from "../api"
import { FeedbackDetailPane } from "../components/FeedbackDetailPane"
import { FeedbackListRow } from "../components/FeedbackListRow"
import { CATEGORIES } from "../lib/feedback-ui"

const STATUS_CHIPS: [string, string][] = [
  ["__all__", "All"],
  ["new", "New"],
  ["in_review", "In Review"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
]

export default function FeedbackAdminPage() {
  const canManage = useCan("feedback:manage:org")

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<AdminUser[]>([])

  // Filters — "__all__" is the sentinel for "no filter" (Radix SelectItem rejects "")
  const [statusFilter, setStatusFilter] = useState("__all__")
  const [categoryFilter, setCategoryFilter] = useState("__all__")
  const [query, setQuery] = useState("")
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Detail pane
  const [selected, setSelected] = useState<FeedbackItem | null>(null)
  const [notes, setNotes] = useState<FeedbackNote[]>([])
  const [activity, setActivity] = useState<FeedbackActivity[]>([])
  const [noteBody, setNoteBody] = useState("")
  const [addingNote, setAddingNote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    if (!canManage) return
    setLoading(true)
    try {
      const list = await feedbackApi.listAll({
        ...(statusFilter && statusFilter !== "__all__" ? { status: statusFilter } : {}),
        ...(categoryFilter && categoryFilter !== "__all__" ? { category: categoryFilter } : {}),
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
      })
      setItems(list)
      return list
    } catch {
      // silent — list stays empty
      return null
    } finally {
      setLoading(false)
    }
  }, [canManage, statusFilter, categoryFilter, debouncedQuery])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Load admins for assignee select (once, only when permitted)
  useEffect(() => {
    if (!canManage) return
    feedbackApi
      .listAdmins()
      .then(setAdmins)
      .catch(() => setAdmins([]))
  }, [canManage])

  // Debounce query input
  function onQueryChange(value: string) {
    setQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedQuery(value)
    }, 350)
  }

  async function fetchPaneData(id: string) {
    const [n, a] = await Promise.allSettled([
      feedbackApi.listNotes(id),
      feedbackApi.listActivity(id),
    ])
    setNotes(n.status === "fulfilled" ? n.value : [])
    setActivity(a.status === "fulfilled" ? a.value : [])
  }

  async function openDetail(item: FeedbackItem) {
    setSelected(item)
    setNoteBody("")
    await fetchPaneData(item.id)
  }

  async function handleStatusChange(newStatus: string) {
    if (!selected) return
    setUpdatingStatus(true)
    try {
      // Use the PATCH response directly so the pane reflects the change even
      // when the updated item drops out of the active status filter.
      const updated = await feedbackApi.updateStatus(selected.id, newStatus as FeedbackStatus)
      setSelected(updated)
      toast.success("Status updated")
      await refresh()
      await fetchPaneData(selected.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status")
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleAssigneeChange(assigneeId: string) {
    if (!selected) return
    setAssigning(true)
    try {
      const newId = assigneeId === "__none__" ? null : assigneeId
      const updated = await feedbackApi.assign(selected.id, newId)
      setSelected(updated)
      toast.success("Assignee updated")
      await refresh()
      await fetchPaneData(selected.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update assignee")
    } finally {
      setAssigning(false)
    }
  }

  async function handleAddNote() {
    if (!selected || !noteBody.trim()) return
    setAddingNote(true)
    try {
      await feedbackApi.addNote(selected.id, noteBody.trim())
      setNoteBody("")
      toast.success("Note added")
      const list = await refresh()
      const updated = (list ?? items).find((i) => i.id === selected.id)
      if (updated) setSelected(updated)
      await fetchPaneData(selected.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add note")
    } finally {
      setAddingNote(false)
    }
  }

  async function openDownload(feedbackId: string, attId: number) {
    try {
      const result = await feedbackApi.downloadAttachment(feedbackId, attId)
      window.open(result.url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Failed to download attachment")
    }
  }

  function handleDelete() {
    setConfirmDelete(true)
  }

  async function doDelete() {
    if (!selected || deleting) return // guard against double-submit
    setDeleting(true)
    try {
      await feedbackApi.remove(selected.id)
      toast.success("Feedback deleted")
      setConfirmDelete(false)
      setSelected(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete feedback")
    } finally {
      setDeleting(false)
    }
  }

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Feedback Inbox" />
        <p className="text-text-secondary">You don't have permission to manage feedback.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Feedback Inbox"
        subtitle="Review, triage, and resolve employee submissions."
      />
      <div className="flex gap-3 min-h-[calc(100vh-120px)]">
        {/* ── Left pane: list ─────────────────────────────────────────── */}
        <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-lg bg-surface">
          <div className="border-b border-border-subtle p-3 space-y-2">
            <Input
              placeholder="Search feedback…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label="Search feedback"
            />

            {/* Status chips */}
            <div className="flex flex-wrap gap-1">
              {STATUS_CHIPS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={
                    statusFilter === value
                      ? "rounded-full px-2.5 py-0.5 text-label bg-accent-500/15 text-text-primary"
                      : "rounded-full px-2.5 py-0.5 text-label text-text-secondary hover:bg-surface-hover"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Category select */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger aria-label="Filter by category" className="h-8">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                ["a", "b", "c", "d"].map((k) => (
                  <div key={k} className="h-14 rounded-lg bg-surface-hover animate-pulse" />
                ))
              ) : (
                <>
                  {items.map((it) => (
                    <FeedbackListRow
                      key={it.id}
                      item={it}
                      selected={selected?.id === it.id}
                      onClick={() => void openDetail(it)}
                    />
                  ))}
                  {items.length === 0 && (
                    <EmptyState
                      icon={<MessageSquare className="h-6 w-6" />}
                      title="No feedback"
                      description="No submissions match the current filters."
                    />
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Right pane: detail ──────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-surface">
          {selected ? (
            <FeedbackDetailPane
              item={selected}
              admins={admins}
              notes={notes}
              activity={activity}
              noteBody={noteBody}
              onNoteBodyChange={setNoteBody}
              onAddNote={() => void handleAddNote()}
              onStatusChange={(s) => void handleStatusChange(s)}
              onAssigneeChange={(a) => void handleAssigneeChange(a)}
              onDownload={(fid, aid) => void openDownload(fid, aid)}
              onDelete={handleDelete}
              busy={updatingStatus || assigning || addingNote}
            />
          ) : (
            <div className="grid flex-1 place-items-center">
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title="Select a submission"
                description="Choose an item from the list to review it."
              />
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete feedback?"
          description="This permanently removes the feedback and its attachments. This can't be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => void doDelete()}
        />
      </div>
    </div>
  )
}
