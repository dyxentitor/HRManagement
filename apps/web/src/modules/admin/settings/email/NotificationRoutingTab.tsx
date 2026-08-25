import { AlertTriangle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useCan } from "@/lib/perm"

import {
  type DeliveryMode,
  type RoutingRow,
  type RoutingWriteRow,
  notificationRoutingApi,
} from "../notification-routing-api"
import { CcRecipientsInput } from "./CcRecipientsInput"
import { Section } from "./Section"

// A row carries two transient, UI-only fields beyond the server contract:
// whether the digest guard (below) just overrode its delivery, and the
// delivery it held before that override so it can be restored. Neither is
// sent to the backend — toWriteRow() only ever reads the five write fields.
type WorkingRow = RoutingRow & {
  deliveryFlipped?: boolean
  deliveryBeforeFlip?: DeliveryMode
}

// ---------------------------------------------------------------------------
// Grouping + diffing helpers
// ---------------------------------------------------------------------------

interface DomainGroup {
  domain_label: string
  rows: WorkingRow[]
}

function groupByDomain(rows: WorkingRow[]): DomainGroup[] {
  const groups: DomainGroup[] = []
  for (const row of rows) {
    const existing = groups.find((g) => g.domain_label === row.domain_label)
    if (existing) existing.rows.push(row)
    else groups.push({ domain_label: row.domain_label, rows: [row] })
  }
  return groups
}

function sameEntries(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function rowChanged(row: RoutingRow, original: RoutingRow | undefined): boolean {
  if (!original) return true
  return (
    row.in_app_enabled !== original.in_app_enabled ||
    row.email_enabled !== original.email_enabled ||
    row.delivery !== original.delivery ||
    !sameEntries(row.cc_entries, original.cc_entries)
  )
}

// Digest delivery is incompatible with a non-empty CC list (the backend
// rejects the combination outright). Whenever a CC edit would leave a row in
// that state, fall back to "auto" rather than let a guaranteed-400 combo
// sit in state waiting for Save. `deliveryFlipped` records that this guard
// — not the user — made the change, so the row can surface it inline, and
// `deliveryBeforeFlip` remembers what to put back.
function applyCcWithDigestGuard(row: WorkingRow, next: string[]): WorkingRow {
  if (row.delivery === "digest" && next.length > 0) {
    return {
      ...row,
      cc_entries: next,
      delivery: "auto",
      deliveryFlipped: true,
      deliveryBeforeFlip: "digest",
    }
  }
  // Emptying the CC list removes the reason for the flip, so restore the lane
  // the row actually had. Leaving it on "auto" would make the row a genuine
  // diff and Save would persist a delivery change nobody asked for.
  if (next.length === 0 && row.deliveryBeforeFlip) {
    return {
      ...row,
      cc_entries: next,
      delivery: row.deliveryBeforeFlip,
      deliveryFlipped: false,
      deliveryBeforeFlip: undefined,
    }
  }
  return { ...row, cc_entries: next }
}

function toWriteRow(row: RoutingRow): RoutingWriteRow {
  return {
    type: row.type,
    in_app_enabled: row.in_app_enabled,
    email_enabled: row.email_enabled,
    delivery: row.delivery,
    cc_entries: row.cc_entries,
  }
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export default function NotificationRoutingTab() {
  // Matches both sibling tabs. Without it a read-only admin gets a fully
  // editable grid and a Save that 403s.
  const canWrite = useCan("org:email_config:write")
  const [rows, setRows] = useState<WorkingRow[] | null>(null)
  const [snapshot, setSnapshot] = useState<RoutingRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCc, setBulkCc] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    notificationRoutingApi
      .list()
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setSnapshot(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : "Failed to load notification routing")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => groupByDomain(rows ?? []), [rows])

  const changed = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) =>
      rowChanged(
        r,
        snapshot.find((s) => s.type === r.type),
      ),
    )
  }, [rows, snapshot])

  function updateRow(type: string, transform: (row: WorkingRow) => WorkingRow) {
    setRows((prev) => (prev ? prev.map((r) => (r.type === type ? transform(r) : r)) : prev))
  }

  function patchRow(type: string, patch: Partial<RoutingRow>) {
    updateRow(type, (r) => ({ ...r, ...patch }))
  }

  // Manual delivery choice is an explicit user decision — it always wins,
  // clears any earlier auto-flip note, and forfeits the restore (the user
  // picked this lane on purpose, so emptying the CC later must not undo it).
  function changeDelivery(type: string, delivery: DeliveryMode) {
    updateRow(type, (r) => ({
      ...r,
      delivery,
      deliveryFlipped: false,
      deliveryBeforeFlip: undefined,
    }))
  }

  // CC edits are the one path that can trigger the digest guard.
  function changeCc(type: string, next: string[]) {
    updateRow(type, (r) => applyCcWithDigestGuard(r, next))
  }

  function toggleSelected(type: string, isSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (isSelected) next.add(type)
      else next.delete(type)
      return next
    })
  }

  function applyBulk() {
    setRows((prev) =>
      prev
        ? prev.map((r) => (selected.has(r.type) ? applyCcWithDigestGuard(r, [...bulkCc]) : r))
        : prev,
    )
  }

  async function onSave() {
    if (changed.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await notificationRoutingApi.save(changed.map(toWriteRow))
      setRows(updated)
      setSnapshot(updated)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save notification routing")
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-coral text-body">{loadError}</p>
      </div>
    )
  }

  if (!rows) {
    return <div className="text-text-secondary">Loading…</div>
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        {/* Bulk CC bar */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="bulk-cc" className="mb-1 block text-label uppercase text-text-tertiary">
              Bulk CC
            </label>
            <CcRecipientsInput
              id="bulk-cc"
              value={bulkCc}
              tokens={[]}
              onChange={setBulkCc}
              disabled={!canWrite}
            />
          </div>
          <Button type="button" onClick={applyBulk} disabled={!canWrite || selected.size === 0}>
            Apply to {selected.size} selected
          </Button>
        </div>

        {/* Domain groups */}
        {groups.map((group) => (
          <Section key={group.domain_label} title={group.domain_label}>
            <div className="flex flex-col gap-3">
              {group.rows.map((row) => (
                <RoutingRowView
                  key={row.type}
                  row={row}
                  canWrite={canWrite}
                  selected={selected.has(row.type)}
                  onToggleSelected={(isSelected) => toggleSelected(row.type, isSelected)}
                  onChange={(patch) => patchRow(row.type, patch)}
                  onDeliveryChange={(value) => changeDelivery(row.type, value)}
                  onCcChange={(next) => changeCc(row.type, next)}
                />
              ))}
            </div>
          </Section>
        ))}

        {saveError && <p className="text-coral text-small">{saveError}</p>}

        <div className="flex justify-end border-t border-border-subtle pt-3">
          <Button
            type="button"
            onClick={onSave}
            disabled={!canWrite || saving || changed.length === 0}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function RoutingRowView({
  row,
  canWrite,
  selected,
  onToggleSelected,
  onChange,
  onDeliveryChange,
  onCcChange,
}: {
  row: WorkingRow
  canWrite: boolean
  selected: boolean
  onToggleSelected: (isSelected: boolean) => void
  onChange: (patch: Partial<RoutingRow>) => void
  onDeliveryChange: (value: DeliveryMode) => void
  onCcChange: (next: string[]) => void
}) {
  const hasCc = row.cc_entries.length > 0
  const showCaution = row.sensitive_content && hasCc
  // A CC only sends when the To-recipient's own email row exists, and for a
  // default-off type every user is seeded with an explicit opt-out. Configuring
  // a CC here therefore usually produces silence, which the grid would
  // otherwise present as a working setting.
  const showDefaultOffCaution = !row.email_default && hasCc

  return (
    <div
      data-testid={`routing-row-${row.type}`}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          aria-label={`Select ${row.label}`}
          checked={selected}
          disabled={!canWrite}
          onCheckedChange={(checked) => onToggleSelected(checked === true)}
        />
        <span className="flex-1 text-body text-text-primary">{row.label}</span>

        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-small text-text-tertiary">
            In-app
          </span>
          {/* Security types are force-enabled on BOTH channels at send time
              and rejected by the serializer if disabled, so the in-app switch
              locks exactly as the email one does. */}
          {row.security ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch aria-label="In-app" checked={row.in_app_enabled} disabled />
                </span>
              </TooltipTrigger>
              <TooltipContent>Security notifications can&apos;t be turned off.</TooltipContent>
            </Tooltip>
          ) : (
            <Switch
              aria-label="In-app"
              checked={row.in_app_enabled}
              disabled={!canWrite}
              onCheckedChange={(checked) => onChange({ in_app_enabled: checked })}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-small text-text-tertiary">
            Email
          </span>
          {row.security ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch aria-label="Email" checked={row.email_enabled} disabled />
                </span>
              </TooltipTrigger>
              <TooltipContent>Security notifications can&apos;t be turned off.</TooltipContent>
            </Tooltip>
          ) : (
            <Switch
              aria-label="Email"
              checked={row.email_enabled}
              disabled={!canWrite}
              onCheckedChange={(checked) => onChange({ email_enabled: checked })}
            />
          )}
        </div>

        <Select
          value={row.delivery}
          disabled={!canWrite}
          onValueChange={(value) => onDeliveryChange(value as DeliveryMode)}
        >
          <SelectTrigger aria-label={`Delivery for ${row.label}`} className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="immediate">Immediate</SelectItem>
            <SelectItem value="digest" disabled={row.cc_entries.length > 0}>
              Digest
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {row.deliveryFlipped && (
        <p className="flex items-start gap-1 text-small text-yellow">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Digest can&apos;t carry a CC, so delivery switched to Auto.</span>
        </p>
      )}

      <CcRecipientsInput
        id={`cc-${row.type}`}
        value={row.cc_entries}
        tokens={row.available_tokens}
        disabled={!canWrite}
        onChange={onCcChange}
      />

      {showDefaultOffCaution && (
        <p className="flex items-start gap-1 text-small text-yellow">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Most users have email off for this notification by default, so this CC may not send. Ask
            them to enable it in their notification preferences.
          </span>
        </p>
      )}

      {showCaution && (
        <p className="flex items-start gap-1 text-small text-yellow">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>CC&apos;d recipients will see the full details in this email.</span>
        </p>
      )}
    </div>
  )
}
