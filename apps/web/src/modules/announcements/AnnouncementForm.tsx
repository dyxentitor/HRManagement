import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCan } from "@/lib/perm"

import {
  type AnnouncementCategory,
  type AnnouncementPriority,
  type AnnouncementWrite,
  type AudienceType,
  announcementsApi,
} from "./api"

type When = "draft" | "publish" | "schedule"

const CATEGORIES: AnnouncementCategory[] = ["general", "policy", "event", "maintenance", "holiday"]
const PRIORITIES: AnnouncementPriority[] = ["low", "normal", "high"]
const AUDIENCES: AudienceType[] = ["all", "departments", "roles", "teams", "employees"]

export default function AnnouncementForm() {
  const canWrite = useCan("announcement:write")
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editing = Boolean(id)
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [category, setCategory] = useState<AnnouncementCategory>("general")
  const [priority, setPriority] = useState<AnnouncementPriority>("normal")
  const [pinned, setPinned] = useState(false)
  const [expiresAt, setExpiresAt] = useState("")
  const [audienceType, setAudienceType] = useState<AudienceType>("all")
  const [audienceSpec, setAudienceSpec] = useState("")
  const [when, setWhen] = useState<When>("publish")
  const [scheduledAt, setScheduledAt] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    announcementsApi.get(id).then((a) => {
      setTitle(a.title)
      setBody(a.body)
      setCategory(a.category)
      setPriority(a.priority)
      setPinned(a.pinned)
      setExpiresAt(a.expires_at ? a.expires_at.slice(0, 10) : "")
      setAudienceType(a.audience_type)
      setAudienceSpec((a.audience_spec ?? []).join(", "))
      setWhen("draft")
    })
  }, [id])

  function payload(): AnnouncementWrite {
    const spec =
      audienceType === "all"
        ? []
        : audienceSpec
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    return {
      title: title.trim(),
      body: body.trim(),
      category,
      priority,
      pinned,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      scheduled_at: when === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      audience_type: audienceType,
      audience_spec: spec,
      publish_now: !editing && when === "publish",
    }
  }

  async function save() {
    if (!title.trim()) {
      setError("Title is required.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (editing && id) {
        await announcementsApi.update(id, payload())
      } else {
        await announcementsApi.create(payload())
      }
      toast.success(editing ? "Announcement updated" : "Announcement created")
      navigate("/announcements/manage")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function uploadFile(file: File) {
    if (!id) return
    try {
      const { presigned_url, s3_key } = await announcementsApi.presignAttachment(
        id,
        file.name,
        file.type || "application/octet-stream",
      )
      await fetch(presigned_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      await announcementsApi.registerAttachment(id, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        s3_key,
      })
      toast.success("Attachment uploaded")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    }
  }

  if (!canWrite) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Announcement" />
        <p className="text-text-tertiary">You don't have permission to author announcements.</p>
      </div>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={editing ? "Edit Announcement" : "New Announcement"} />

      <Field label="Title" htmlFor="a-title">
        <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Body" htmlFor="a-body">
        <Textarea id="a-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="a-cat">
          <NativeSelect
            id="a-cat"
            value={category}
            onChange={(v) => setCategory(v as AnnouncementCategory)}
            options={CATEGORIES}
          />
        </Field>
        <Field label="Priority" htmlFor="a-pri">
          <NativeSelect
            id="a-pri"
            value={priority}
            onChange={(v) => setPriority(v as AnnouncementPriority)}
            options={PRIORITIES}
          />
        </Field>
      </div>
      <Field label="Pinned">
        <Switch aria-label="Pinned" checked={pinned} onCheckedChange={setPinned} />
      </Field>
      <Field label="Expires on" htmlFor="a-exp">
        <Input
          id="a-exp"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Audience" htmlFor="a-aud">
          <NativeSelect
            id="a-aud"
            value={audienceType}
            onChange={(v) => setAudienceType(v as AudienceType)}
            options={AUDIENCES}
          />
        </Field>
        {audienceType !== "all" && (
          <Field label="Targets (comma-separated)" htmlFor="a-spec">
            <Input
              id="a-spec"
              value={audienceSpec}
              onChange={(e) => setAudienceSpec(e.target.value)}
              placeholder={audienceType === "roles" ? "hr_manager, finance" : "ids…"}
            />
          </Field>
        )}
      </div>

      {!editing && (
        <Field label="When">
          <div className="flex flex-wrap gap-3 text-body text-text-secondary">
            {(["publish", "schedule", "draft"] as When[]).map((w) => (
              <label key={w} className="flex items-center gap-1.5">
                <input type="radio" name="when" checked={when === w} onChange={() => setWhen(w)} />
                {w === "publish" ? "Publish now" : w === "schedule" ? "Schedule" : "Save as draft"}
              </label>
            ))}
          </div>
        </Field>
      )}
      {!editing && when === "schedule" && (
        <Field label="Schedule at" htmlFor="a-sched">
          <Input
            id="a-sched"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </Field>
      )}

      {editing && (
        <Field label="Attachment">
          <input
            ref={fileRef}
            type="file"
            aria-label="Attachment"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadFile(f)
            }}
            className="text-small text-text-secondary"
          />
        </Field>
      )}

      {error && <p className="text-coral text-small">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
        <Button type="button" variant="ghost" onClick={() => navigate("/announcements/manage")}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create"}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label uppercase text-text-tertiary">
        {label}
      </label>
      {children}
    </div>
  )
}

function NativeSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border-subtle bg-canvas px-3 py-2 text-body text-text-secondary focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </option>
      ))}
    </select>
  )
}
