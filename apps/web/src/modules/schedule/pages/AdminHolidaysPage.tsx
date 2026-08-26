import { CalendarDays, CheckCircle2, EyeOff, Lock, Plus, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { DataTable, EmptyState, StatusPill, type StatusPillProps } from "@/components/hrms"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"
import { type OrgSettings, settingsApi } from "@/modules/admin/settings/settings-api"

import { type Holiday, type HolidaySource, type HolidaySyncPreview, holidayApi } from "../api"
import { todayIsoLocal } from "../lib/local-date"
import {
  NATIONAL_ONLY,
  NATIONAL_ONLY_LABEL,
  countryLabel,
  subdivisionsFor,
} from "../lib/subdivisions"
import { weekdayLabel } from "../lib/weekday"

/**
 * Every date on this page is a date-only YYYY-MM-DD key from the API. Parse it
 * UTC-anchored and read it back with `timeZone: "UTC"` — a local-time parse
 * drifts a day in Asia/Kuala_Lumpur (CLAUDE.md §3.9).
 */
function formatHolidayDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * `imported_at` and `confirmed_at` are real instants, not date-only keys, so
 * they are deliberately rendered in the viewer's own timezone — the opposite
 * of `formatHolidayDate` above. Do not merge the two.
 */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const SOURCE_META: Record<HolidaySource, { label: string; tone: StatusPillProps["tone"] }> = {
  company: { label: "Company", tone: "lavender" },
  override: { label: "Override", tone: "peach" },
  import: { label: "Imported", tone: "sky" },
  legacy: { label: "Legacy", tone: "yellow" },
}

const PROTECTED_HINT = "Protected — a holiday import will not overwrite or withdraw this entry."

const PROVISIONAL_LABEL = "Provisional — hidden from employees"
const PROVISIONAL_HINT =
  "The date is not gazetted yet, so employees cannot see it. Confirm it to publish."
const CONFIRM_HINT = "Confirm publishes this date to employees."

/** Current year in local (KL) terms, derived from the local-date helper. */
function currentYear(): number {
  return Number(todayIsoLocal().slice(0, 4))
}

function yearOptions(year: number): number[] {
  const base = currentYear()
  const years = new Set<number>([year])
  for (let y = base - 3; y <= base + 2; y += 1) years.add(y)
  return [...years].sort((a, b) => a - b)
}

type Modal =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; holiday: Holiday }
  | { kind: "delete"; holiday: Holiday }
  | { kind: "preview" }

export default function AdminHolidaysPage() {
  const canWrite = useCan("schedule:holiday:write")
  const [year, setYear] = useState(currentYear)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>({ kind: "closed" })

  const refresh = useCallback(async () => {
    const rows = await holidayApi.list(year)
    setHolidays(rows)
  }, [year])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    holidayApi
      .list(year)
      .then((rows) => {
        if (!cancelled) setHolidays(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setHolidays([])
          setError("Could not load holidays for this year.")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  async function toggleExcluded(holiday: Holiday) {
    try {
      await holidayApi.update(holiday.id, { excluded: !holiday.excluded })
      toast.success(holiday.excluded ? "Holiday restored" : "Holiday excluded")
      await refresh()
    } catch {
      toast.error("Could not update the holiday")
    }
  }

  async function confirmHoliday(holiday: Holiday) {
    try {
      await holidayApi.confirm(holiday.id)
      toast.success(`${holiday.name} confirmed — the date is now published to employees.`)
      await refresh()
    } catch {
      toast.error("Could not confirm the holiday")
    }
  }

  async function remove(holiday: Holiday) {
    try {
      await holidayApi.remove(holiday.id)
      toast.success("Holiday deleted")
      await refresh()
    } catch {
      toast.error("Could not delete the holiday")
    }
  }

  const activeCount = holidays.filter((h) => !h.excluded).length

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <PageHeader
          title="Holidays"
          subtitle={
            loading
              ? "Loading…"
              : `${holidays.length} entries for ${year} · ${activeCount} observed as non-working`
          }
          actions={
            canWrite ? (
              <>
                <Button type="button" variant="ghost" onClick={() => setModal({ kind: "preview" })}>
                  <RefreshCw className="size-4 mr-1" /> Preview sync
                </Button>
                <Button
                  type="button"
                  onClick={() => setModal({ kind: "create" })}
                  className="bg-accent-500 hover:bg-accent-600 text-white"
                >
                  <Plus className="size-4 mr-1" /> Add company holiday
                </Button>
              </>
            ) : undefined
          }
        />

        <HolidayCalendarSettings />

        <div className="flex items-center gap-2">
          <label htmlFor="holiday-year" className="text-label uppercase text-text-tertiary">
            Year
          </label>
          <select
            id="holiday-year"
            aria-label="Year"
            className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions(year).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {!loading && <LastImportStatus holidays={holidays} year={year} />}

        {error && <p className="text-small text-coral">{error}</p>}

        {!loading && holidays.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title={`No holidays recorded for ${year}`}
            description={
              canWrite
                ? "Add a company holiday, or ask an administrator to run the holiday import for this year."
                : "Ask an administrator to run the holiday import for this year."
            }
          />
        ) : (
          <DataTable
            rows={holidays}
            rowKey={(h) => h.id}
            columns={[
              {
                key: "date",
                header: "Date",
                sortable: true,
                sortValue: (h) => h.date,
                render: (h) => (
                  <span
                    className={cn(
                      "whitespace-nowrap",
                      h.excluded && "line-through text-text-tertiary",
                    )}
                  >
                    {formatHolidayDate(h.date)}
                  </span>
                ),
              },
              {
                key: "weekday",
                header: "Weekday",
                render: (h) => (
                  <span className={cn("text-text-tertiary", h.excluded && "line-through")}>
                    {weekdayLabel(h.date, "long")}
                  </span>
                ),
              },
              {
                key: "name",
                header: "Name",
                sortable: true,
                sortValue: (h) => h.name,
                render: (h) => (
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-text-primary",
                        h.excluded && "line-through text-text-tertiary",
                      )}
                    >
                      {h.name}
                    </span>
                    {h.is_protected && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Protected: ${h.name}`}
                            title={PROTECTED_HINT}
                            className="text-text-tertiary hover:text-text-secondary"
                          >
                            <Lock className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{PROTECTED_HINT}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ),
              },
              {
                key: "type",
                header: "Type",
                render: (h) => <span className="capitalize text-text-secondary">{h.type}</span>,
              },
              {
                key: "source",
                header: "Source",
                render: (h) => {
                  const meta = SOURCE_META[h.source] ?? { label: h.source, tone: "lavender" }
                  return (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={meta.tone} label={meta.label} />
                      {h.observed && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider text-mint bg-mint/15 px-1.5 py-0.5 rounded"
                          title="Observed in lieu of the actual date"
                        >
                          Observed
                        </span>
                      )}
                      {h.provisional && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider text-yellow bg-yellow/15 px-1.5 py-0.5 rounded"
                          title="Provisional — the date is not yet gazetted"
                        >
                          Provisional
                        </span>
                      )}
                      {h.excluded && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider text-coral bg-coral/15 px-1.5 py-0.5 rounded"
                          title="Excluded — not treated as a non-working day"
                        >
                          Excluded
                        </span>
                      )}
                    </div>
                  )
                },
              },
              {
                key: "publication",
                header: "Employee visibility",
                render: (h) => <PublicationCell holiday={h} />,
              },
              {
                key: "actions",
                header: "",
                align: "right",
                render: (h) =>
                  canWrite ? (
                    <div className="flex justify-end gap-2">
                      {h.provisional && (
                        <button
                          type="button"
                          aria-label={`Confirm ${h.name}`}
                          title={CONFIRM_HINT}
                          onClick={() => void confirmHoliday(h)}
                          className="text-small text-mint hover:text-mint/80"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Edit ${h.name}`}
                        onClick={() => setModal({ kind: "edit", holiday: h })}
                        className="text-small text-accent-200 hover:text-accent-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`${h.excluded ? "Include" : "Exclude"} ${h.name}`}
                        onClick={() => void toggleExcluded(h)}
                        className="text-small text-accent-200 hover:text-accent-50"
                      >
                        {h.excluded ? "Include" : "Exclude"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${h.name}`}
                        onClick={() => setModal({ kind: "delete", holiday: h })}
                        className="text-small text-coral hover:text-coral/80"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null,
              },
            ]}
          />
        )}

        {(modal.kind === "create" || modal.kind === "edit") && (
          <HolidayModal
            modal={modal}
            year={year}
            onCancel={() => setModal({ kind: "closed" })}
            onSaved={async () => {
              setModal({ kind: "closed" })
              await refresh().catch(() => undefined)
            }}
          />
        )}

        <ConfirmDialog
          open={modal.kind === "delete"}
          onOpenChange={(open) => {
            if (!open) setModal({ kind: "closed" })
          }}
          title={modal.kind === "delete" ? `Delete ${modal.holiday.name}?` : "Delete holiday?"}
          description="The date stops counting as a public holiday for leave and payroll. Exclude it instead if you only want to skip it this year."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            if (modal.kind === "delete") void remove(modal.holiday)
          }}
        />

        {modal.kind === "preview" && (
          <SyncPreviewDialog year={year} onClose={() => setModal({ kind: "closed" })} />
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * Whether the row is visible to employees, and how to change that.
 *
 * `published` is server-derived (false while `excluded` or `provisional`), so
 * it is the single source of truth for the "can staff see this?" question.
 */
function PublicationCell({ holiday }: { holiday: Holiday }) {
  if (holiday.provisional) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-small text-yellow"
        title={PROVISIONAL_HINT}
      >
        <EyeOff className="size-3.5 shrink-0" aria-hidden />
        {PROVISIONAL_LABEL}
      </span>
    )
  }
  if (holiday.confirmed_at) {
    return (
      <span className="inline-flex items-center gap-1.5 text-small text-mint">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
        {`Confirmed ${formatTimestamp(holiday.confirmed_at)}`}
      </span>
    )
  }
  if (!holiday.published) {
    return (
      <span className="inline-flex items-center gap-1.5 text-small text-text-tertiary">
        <EyeOff className="size-3.5 shrink-0" aria-hidden />
        Hidden from employees
      </span>
    )
  }
  return <span className="text-small text-text-secondary">Visible to employees</span>
}

/** Most recently imported row in the loaded set, or null when none came from an import. */
function latestImport(holidays: Holiday[]): Holiday | null {
  let best: Holiday | null = null
  for (const h of holidays) {
    if (!h.imported_at) continue
    if (!best || Date.parse(h.imported_at) > Date.parse(best.imported_at as string)) best = h
  }
  return best
}

function LastImportStatus({ holidays, year }: { holidays: Holiday[]; year: number }) {
  const latest = latestImport(holidays)
  if (!latest?.imported_at) {
    return (
      <p className="text-small text-text-tertiary">
        No imported holidays for {year} — every entry here was added by hand.
      </p>
    )
  }
  const provider = [latest.source_provider, latest.source_version].filter(Boolean).join(" ")
  return (
    <p className="text-small text-text-tertiary">
      {`Last imported ${formatTimestamp(latest.imported_at)}${provider ? ` from ${provider}` : ""}`}
    </p>
  )
}

/**
 * Which gazetted calendar the import follows. Reads + writes the org record,
 * so it fails soft: a user without `org:settings:read` still gets the holiday
 * table, just without this panel (CLAUDE.md §3.7).
 */
function HolidayCalendarSettings() {
  const canWriteOrg = useCan("org:settings:write")
  const [org, setOrg] = useState<OrgSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    settingsApi
      .getOrg()
      .then((fresh) => {
        if (!cancelled) setOrg(fresh)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!org) return null

  const current = org.default_subdivision_code ?? NATIONAL_ONLY
  const options = subdivisionsFor(org.country_code)

  async function change(next: string) {
    if (!org) return
    const previous = org
    setOrg({ ...org, default_subdivision_code: next })
    setSaving(true)
    setFieldError(null)
    try {
      const fresh = await settingsApi.patchOrg({ default_subdivision_code: next })
      setOrg(fresh)
      toast.success("Holiday calendar updated")
    } catch (e: unknown) {
      setOrg(previous)
      const fields = (e as { fields?: Record<string, string> } | null)?.fields
      setFieldError(
        fields?.default_subdivision_code ??
          (e instanceof Error ? e.message : "Could not update the holiday calendar."),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby="holiday-calendar-heading"
      className="rounded-lg border border-border-subtle bg-surface p-4"
    >
      <h2 id="holiday-calendar-heading" className="text-label uppercase text-text-tertiary">
        Holiday calendar
      </h2>
      <p className="text-small text-text-tertiary mt-1 mb-3">
        The gazetted calendar the holiday import follows. Picking a state narrows the national list
        to that state's observances.
      </p>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <span className="text-label uppercase text-text-tertiary block mb-1">Country</span>
          <p className="text-body text-text-primary">{countryLabel(org.country_code)}</p>
        </div>
        <div>
          <label
            htmlFor="holiday-subdivision"
            className="text-label uppercase text-text-tertiary block mb-1"
          >
            State or subdivision
          </label>
          <select
            id="holiday-subdivision"
            aria-label="State or subdivision"
            className="bg-canvas border border-border-subtle rounded px-2 py-1.5 disabled:opacity-60"
            value={current}
            disabled={!canWriteOrg || saving}
            onChange={(e) => void change(e.target.value)}
          >
            <option value={NATIONAL_ONLY}>{NATIONAL_ONLY_LABEL}</option>
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name} ({option.code})
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="text-small text-text-tertiary mt-1">
              No subdivision list is configured for {countryLabel(org.country_code)} — national
              holidays only.
            </p>
          )}
          {fieldError && (
            <p role="alert" className="text-small text-coral mt-1">
              {fieldError}
            </p>
          )}
          {!canWriteOrg && (
            <p className="text-small text-text-tertiary mt-1">
              Changing this needs organisation settings access.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function HolidayModal({
  modal,
  year,
  onCancel,
  onSaved,
}: {
  modal: { kind: "create" } | { kind: "edit"; holiday: Holiday }
  year: number
  onCancel: () => void
  onSaved: () => void | Promise<void>
}) {
  const editing = modal.kind === "edit" ? modal.holiday : null
  const [date, setDate] = useState(editing?.date ?? `${year}-01-01`)
  const [name, setName] = useState(editing?.name ?? "")
  const [notes, setNotes] = useState(editing?.notes ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await holidayApi.update(editing.id, { name, notes })
      } else {
        // Human-added rows are company holidays by definition; the backend
        // stamps `source = company` and protects them from import.
        await holidayApi.create({ date, name, type: "company", notes })
      }
      toast.success(editing ? "Holiday updated" : "Holiday added")
      await onSaved()
    } catch {
      setError("Save failed. Check the date is not already taken.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit holiday" : "Add company holiday"}</DialogTitle>
          <DialogDescription>
            {editing && editing.source !== "company"
              ? "This entry came from an import. Saving keeps your wording as an organisation override, and the next import will flag it as a conflict instead of reverting it."
              : "Company holidays are protected — a later import will not overwrite or withdraw them."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!editing && (
            <div className="block">
              <label
                htmlFor="holiday-date"
                className="text-label uppercase text-text-tertiary block mb-1"
              >
                Date
              </label>
              <Input
                id="holiday-date"
                aria-label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          )}
          {editing && (
            <p className="text-small text-text-tertiary">
              {formatHolidayDate(editing.date)} · {weekdayLabel(editing.date, "long")}
            </p>
          )}
          <div className="block">
            <label
              htmlFor="holiday-name"
              className="text-label uppercase text-text-tertiary block mb-1"
            >
              Name
            </label>
            <Input
              id="holiday-name"
              aria-label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="block">
            <label
              htmlFor="holiday-notes"
              className="text-label uppercase text-text-tertiary block mb-1"
            >
              Notes
            </label>
            <Textarea
              id="holiday-notes"
              aria-label="Notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
            />
          </div>
          {error && <p className="text-small text-coral">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy || !name || !date}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SyncPreviewDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const [preview, setPreview] = useState<HolidaySyncPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    holidayApi
      .syncPreview(year)
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .catch(() => {
        if (!cancelled) setError("Could not build the preview.")
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const counts = preview?.counts

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Holiday sync preview · {year}</DialogTitle>
          <DialogDescription>
            This is a read-only preview. Nothing is written and no external provider is contacted.
            Applying an import is a server-side operation run by an administrator, so there is
            deliberately no apply button here.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-small text-coral">{error}</p>}
        {!preview && !error && <p className="text-small text-text-tertiary">Loading preview…</p>}

        {counts && (
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Added", counts.added],
                  ["Updated", counts.updated],
                  ["Unchanged", counts.unchanged],
                  ["Withdrawn", counts.withdrawn],
                  ["Skipped", counts.skipped],
                  ["Conflicted", counts.conflicted],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="bg-surface-hover border border-border-subtle rounded-lg px-3 py-2"
                >
                  <dt className="text-label uppercase text-text-tertiary">{label}</dt>
                  <dd className="text-h3 text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>

            <PreviewList title="Changes" items={preview.changes} empty="No changes detected." />
            <PreviewList
              title="Conflicts"
              items={preview.conflicts}
              empty="No conflicts — nothing you have edited would be overwritten."
              tone="coral"
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewList({
  title,
  items,
  empty,
  tone,
}: {
  title: string
  items: string[]
  empty: string
  tone?: "coral"
}) {
  return (
    <section>
      <h3
        className={cn(
          "text-label uppercase mb-1",
          tone === "coral" ? "text-coral" : "text-text-tertiary",
        )}
      >
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-small text-text-tertiary">{empty}</p>
      ) : (
        <ul className="max-h-48 overflow-auto space-y-1">
          {items.map((line) => (
            <li key={line} className="text-small text-text-secondary font-mono">
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
