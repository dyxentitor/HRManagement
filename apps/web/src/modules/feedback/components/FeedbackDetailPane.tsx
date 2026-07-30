import { StatusPill } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  AdminUser,
  FeedbackActivity,
  FeedbackItem,
  FeedbackNote,
  FeedbackStatus,
} from "../api"
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  fmtDate,
  relativeTime,
} from "../lib/feedback-ui"

const STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In Review" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function activityPredicate(ev: FeedbackActivity): string {
  if (ev.action === "feedback.status.changed") {
    const afterStatus = (ev.after as Record<string, string> | null)?.status ?? ""
    const label = STATUS_LABELS[afterStatus as FeedbackStatus] ?? afterStatus
    return `changed status → ${label}`
  }
  if (ev.action === "feedback.assigned") {
    return "updated the assignee"
  }
  return "made a change"
}

export interface FeedbackDetailPaneProps {
  item: FeedbackItem
  admins: AdminUser[]
  notes: FeedbackNote[]
  activity: FeedbackActivity[]
  noteBody: string
  onNoteBodyChange: (val: string) => void
  onAddNote: () => void
  onStatusChange: (status: string) => void
  onAssigneeChange: (assigneeId: string) => void
  onDownload: (feedbackId: string, attachmentId: number) => void
  onDelete: () => void
  busy: boolean
}

export function FeedbackDetailPane({
  item,
  admins,
  notes,
  activity,
  noteBody,
  onNoteBodyChange,
  onAddNote,
  onStatusChange,
  onAssigneeChange,
  onDownload,
  onDelete,
  busy,
}: FeedbackDetailPaneProps) {
  const isTerminal = item.status === "resolved" || item.status === "closed"
  const hasAttachments = (item.attachments?.length ?? 0) > 0

  // Synthesized "submitted" entry prepended; activity shown newest-first
  const sortedActivity = [...activity].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Non-scrolling header ─────────────────────────────────────── */}
      <div className="flex-none px-5 py-4 border-b border-border-subtle space-y-2">
        <StatusPill
          tone={STATUS_TONE[item.status]}
          label={STATUS_LABELS[item.status] ?? item.status}
        />

        <h2 className="text-h2 text-text-primary">{item.title}</h2>

        <p className="text-small text-text-tertiary">
          {CATEGORY_LABELS[item.category] ?? item.category}
          {" · from "}
          {item.reporter_email ?? "—"}
          {" · "}
          {fmtDate(item.created_at)}
        </p>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Select value={item.status} onValueChange={onStatusChange} disabled={busy}>
            <SelectTrigger className="h-8 w-[148px]" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={item.assignee_id ?? "__none__"}
            onValueChange={onAssigneeChange}
            disabled={busy}
          >
            <SelectTrigger className="h-8 w-[176px]" aria-label="Assignee">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!isTerminal && (
            <Button
              type="button"
              size="sm"
              onClick={() => onStatusChange("resolved")}
              disabled={busy}
            >
              Mark Resolved
            </Button>
          )}
          {isTerminal && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-coral"
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* ── Single-scroll body ───────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="px-5 py-5 space-y-6">
          {/* 1. Description */}
          <section>
            <p className="text-label uppercase text-text-tertiary pb-1.5 mb-2 border-b border-border-subtle">
              Description
            </p>
            <p className="text-small text-text-secondary whitespace-pre-wrap leading-relaxed">
              {item.description}
            </p>
          </section>

          {/* 2. Details */}
          <section>
            <p className="text-label uppercase text-text-tertiary pb-1.5 mb-3 border-b border-border-subtle">
              Details
            </p>
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-label uppercase text-text-tertiary mb-0.5">Category</dt>
                <dd className="text-small text-text-primary">
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </dd>
              </div>
              <div>
                <dt className="text-label uppercase text-text-tertiary mb-0.5">Affected module</dt>
                <dd className="text-small text-text-primary">{item.affected_module || "—"}</dd>
              </div>
              <div>
                <dt className="text-label uppercase text-text-tertiary mb-0.5">Submitted</dt>
                <dd className="text-small text-text-primary">{relativeTime(item.created_at)}</dd>
              </div>
            </dl>
          </section>

          {/* 3. Internal notes */}
          <section>
            <p className="text-label uppercase text-text-tertiary pb-1.5 mb-3 border-b border-border-subtle">
              Internal notes · {notes.length}
            </p>

            {notes.length > 0 ? (
              <ul className="space-y-2 mb-3">
                {notes.map((n) => (
                  <li key={n.id} className="bg-surface-elevated/60 rounded-lg px-3 py-2.5">
                    <p className="text-small font-semibold text-text-primary mb-0.5">
                      {n.author_name} · {relativeTime(n.created_at)}
                    </p>
                    <p className="text-small text-text-secondary whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-text-tertiary mb-3">No notes yet.</p>
            )}

            <Textarea
              value={noteBody}
              onChange={(e) => onNoteBodyChange(e.target.value)}
              rows={3}
              maxLength={10000}
              placeholder="Add an internal note…"
              aria-label="Internal note"
              className="mb-1"
            />
            <p className="text-[11px] text-text-tertiary text-right mb-2">
              {noteBody.length}/10000
            </p>
            <Button
              type="button"
              onClick={onAddNote}
              disabled={!noteBody.trim() || busy}
              className="w-full"
            >
              Add note
            </Button>
          </section>

          {/* 4. Attachments — omitted when none */}
          {hasAttachments && (
            <section>
              <p className="text-label uppercase text-text-tertiary pb-1.5 mb-3 border-b border-border-subtle">
                Attachments · {(item.attachments ?? []).length}
              </p>
              <ul className="space-y-1.5">
                {(item.attachments ?? []).map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center gap-3 bg-surface-elevated/60 rounded-lg px-3 py-2"
                  >
                    <span className="text-small text-text-secondary flex-1 truncate">
                      {att.filename}
                      <span className="text-text-tertiary ml-2">
                        · {formatBytes(att.size_bytes)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-small text-accent-200 hover:text-accent-50 transition-colors duration-fast flex-none"
                      onClick={() => onDownload(item.id, att.id)}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 5. Activity — newest first, with synthesized "submitted" entry */}
          <section>
            <p className="text-label uppercase text-text-tertiary pb-1.5 mb-3 border-b border-border-subtle">
              Activity
            </p>
            <ul className="space-y-2.5">
              {sortedActivity.map((ev) => (
                <li key={ev.id} className="flex gap-2.5 items-start">
                  <span
                    aria-hidden
                    className="mt-[5px] h-[7px] w-[7px] rounded-full bg-accent-500 flex-none"
                  />
                  <p className="text-small text-text-secondary">
                    <b className="font-semibold text-text-primary">{ev.actor ?? "System"}</b>{" "}
                    {activityPredicate(ev)}{" "}
                    <span className="text-text-tertiary">· {relativeTime(ev.ts)}</span>
                  </p>
                </li>
              ))}
              {/* Synthesized submission entry — always last */}
              <li className="flex gap-2.5 items-start">
                <span
                  aria-hidden
                  className="mt-[5px] h-[7px] w-[7px] rounded-full bg-accent-500 flex-none"
                />
                <p className="text-small text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    {item.reporter_name ?? item.reporter_email ?? "Reporter"}
                  </span>{" "}
                  submitted this feedback{" "}
                  <span className="text-text-tertiary">· {relativeTime(item.created_at)}</span>
                </p>
              </li>
            </ul>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
