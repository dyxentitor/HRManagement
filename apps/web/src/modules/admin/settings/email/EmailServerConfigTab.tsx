import { AlertTriangle, CheckCircle2, Eye, EyeOff, Send, XCircle } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { StatusPill } from "@/components/hrms/StatusPill"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCan } from "@/lib/perm"

import { type EmailConfig, emailConfigApi } from "../email-config-api"
import { ENCRYPTION_OPTIONS, type Encryption, PROVIDER_PRESETS } from "../email-config-presets"
import { type EmailConfigForm, validate, warnings } from "../email-config-validation"
import { Section } from "./Section"

const EMPTY: EmailConfigForm = {
  enabled: false,
  smtp_host: "",
  smtp_port: 587,
  encryption: "starttls",
  use_auth: true,
  smtp_username: "",
  smtp_password: "",
  sender_name: "",
  sender_email: "",
  reply_to: "",
  connection_timeout: 10,
  rate_limit_per_minute: 60,
  max_retry_attempts: 3,
  retry_interval_seconds: 60,
  signature: "",
  provider_preset: "",
}

function toForm(cfg: EmailConfig): EmailConfigForm {
  return { ...EMPTY, ...cfg, smtp_password: "" }
}

function fmt(ts: string | null): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

export default function EmailServerConfigTab() {
  const canRead = useCan("org:email_config:read")
  const canWrite = useCan("org:email_config:write")
  const [cfg, setCfg] = useState<EmailConfig | null>(null)
  const [form, setForm] = useState<EmailConfigForm>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [testRecipient, setTestRecipient] = useState("")
  const [sending, setSending] = useState(false)

  const refresh = useCallback(async () => {
    if (!canRead) return
    try {
      const fresh = await emailConfigApi.get()
      setCfg(fresh)
      setForm(toForm(fresh))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load")
    }
  }, [canRead])

  useEffect(() => {
    refresh()
  }, [refresh])

  function set<K extends keyof EmailConfigForm>(key: K, value: EmailConfigForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function applyPreset(id: string) {
    const preset = PROVIDER_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setForm((f) => ({
      ...f,
      provider_preset: id,
      smtp_host: preset.host,
      smtp_port: preset.port,
      encryption: preset.encryption,
    }))
  }

  function payload(): Partial<EmailConfigForm> {
    const { smtp_password, ...rest } = form
    return smtp_password ? { ...rest, smtp_password } : rest
  }

  async function onSave() {
    const errs = validate(form, cfg?.has_password ?? false)
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast.error("Please fix the highlighted fields.")
      return
    }
    setSaving(true)
    try {
      const fresh = await emailConfigApi.patch(payload())
      setCfg(fresh)
      setForm(toForm(fresh))
      toast.success("Email configuration saved")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function onTest() {
    setTesting(true)
    try {
      const res = await emailConfigApi.testConnection(payload())
      if (res.success) toast.success(res.detail)
      else toast.error(res.detail)
      await refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Connection test failed")
    } finally {
      setTesting(false)
    }
  }

  async function onSend() {
    setSending(true)
    try {
      const res = await emailConfigApi.sendTestEmail(testRecipient, payload())
      if (res.success) toast.success(res.detail)
      else toast.error(res.detail)
      setShowTest(false)
      await refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send test email")
    } finally {
      setSending(false)
    }
  }

  if (!canRead) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-text-tertiary">You don't have permission to view email configuration.</p>
      </div>
    )
  }

  if (!cfg) {
    return <div className="text-text-secondary">Loading…</div>
  }

  const hints = warnings(form)
  const health = cfg.last_success_at
    ? { tone: "mint" as const, label: "Healthy" }
    : cfg.last_failure_at
      ? { tone: "coral" as const, label: "Last attempt failed" }
      : { tone: "yellow" as const, label: "Not yet tested" }

  return (
    <div className="flex flex-col gap-5">
      {/* Master toggle + connection health */}
      <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Switch
            aria-label="Enable email notifications"
            checked={form.enabled}
            onCheckedChange={(v) => set("enabled", v)}
            disabled={!canWrite}
          />
          <div>
            <p className="text-body text-text-primary">Enable email notifications</p>
            <p className="text-small text-text-tertiary">
              When off, notification digests are paused. Password resets and invitations still send.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill tone={health.tone} label={health.label} />
          <span className="text-small text-text-tertiary">
            Last success: {fmt(cfg.last_success_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* ---- Form column ---- */}
        <div className="flex flex-col gap-5">
          <Section title="Provider">
            <div className="flex flex-wrap gap-2">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  disabled={!canWrite}
                  aria-pressed={form.provider_preset === p.id}
                  className={
                    form.provider_preset === p.id
                      ? "rounded-lg border border-accent-500 bg-accent-500/10 px-3 py-1.5 text-small text-text-primary"
                      : "rounded-lg border border-border-subtle px-3 py-1.5 text-small text-text-secondary hover:border-border-strong"
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Server">
            <FieldRow label="SMTP host" htmlFor="smtp-host">
              <Input
                id="smtp-host"
                aria-label="SMTP host"
                value={form.smtp_host}
                onChange={(e) => set("smtp_host", e.target.value)}
                placeholder="smtp.example.com"
                disabled={!canWrite}
              />
              <FieldError msg={errors.smtp_host} />
            </FieldRow>
            <FieldRow label="Port" htmlFor="smtp-port">
              <Input
                id="smtp-port"
                type="number"
                aria-label="SMTP port"
                value={form.smtp_port}
                onChange={(e) => set("smtp_port", Number(e.target.value))}
                disabled={!canWrite}
              />
              <FieldError msg={errors.smtp_port} />
            </FieldRow>
            <FieldRow label="Encryption">
              <Select
                value={form.encryption}
                onValueChange={(v) => set("encryption", v as Encryption)}
                disabled={!canWrite}
              >
                <SelectTrigger aria-label="Encryption" className="max-w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENCRYPTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Require authentication">
              <Switch
                aria-label="Require authentication"
                checked={form.use_auth}
                onCheckedChange={(v) => set("use_auth", v)}
                disabled={!canWrite}
              />
            </FieldRow>
            {form.use_auth && (
              <>
                <FieldRow label="Username" htmlFor="smtp-username">
                  <Input
                    id="smtp-username"
                    aria-label="SMTP username"
                    value={form.smtp_username}
                    onChange={(e) => set("smtp_username", e.target.value)}
                    disabled={!canWrite}
                  />
                  <FieldError msg={errors.smtp_username} />
                </FieldRow>
                <FieldRow label="Password" htmlFor="smtp-password">
                  <div className="flex items-center gap-2">
                    <Input
                      id="smtp-password"
                      aria-label="SMTP password"
                      type={reveal ? "text" : "password"}
                      value={form.smtp_password}
                      onChange={(e) => set("smtp_password", e.target.value)}
                      placeholder={cfg.has_password ? "•••••• saved — leave blank to keep" : ""}
                      disabled={!canWrite}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={reveal ? "Hide password" : "Show password"}
                      onClick={() => setReveal((r) => !r)}
                    >
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                  <FieldError msg={errors.smtp_password} />
                </FieldRow>
              </>
            )}
          </Section>

          <Section title="Identity">
            <FieldRow label="Sender name" htmlFor="sender-name">
              <Input
                id="sender-name"
                aria-label="Sender name"
                value={form.sender_name}
                onChange={(e) => set("sender_name", e.target.value)}
                placeholder="Provintell HR"
                disabled={!canWrite}
              />
            </FieldRow>
            <FieldRow label="Sender email" htmlFor="sender-email">
              <Input
                id="sender-email"
                aria-label="Sender email"
                value={form.sender_email}
                onChange={(e) => set("sender_email", e.target.value)}
                placeholder="hr@example.com"
                disabled={!canWrite}
              />
              <FieldError msg={errors.sender_email} />
            </FieldRow>
            <FieldRow label="Reply-to" htmlFor="reply-to">
              <Input
                id="reply-to"
                aria-label="Reply-to"
                value={form.reply_to}
                onChange={(e) => set("reply_to", e.target.value)}
                disabled={!canWrite}
              />
              <FieldError msg={errors.reply_to} />
            </FieldRow>
          </Section>

          <Section title="Delivery">
            <p className="text-small text-text-tertiary mb-3">
              Timeout applies now. Rate limiting and retries are stored and take effect in a
              follow-up release.
            </p>
            <FieldRow label="Connection timeout (s)" htmlFor="timeout">
              <Input
                id="timeout"
                type="number"
                aria-label="Connection timeout"
                value={form.connection_timeout}
                onChange={(e) => set("connection_timeout", Number(e.target.value))}
                disabled={!canWrite}
              />
              <FieldError msg={errors.connection_timeout} />
            </FieldRow>
            <FieldRow label="Rate limit (emails/min)" htmlFor="rate">
              <Input
                id="rate"
                type="number"
                aria-label="Rate limit per minute"
                value={form.rate_limit_per_minute}
                onChange={(e) => set("rate_limit_per_minute", Number(e.target.value))}
                disabled={!canWrite}
              />
              <FieldError msg={errors.rate_limit_per_minute} />
            </FieldRow>
            <FieldRow label="Max retry attempts" htmlFor="retries">
              <Input
                id="retries"
                type="number"
                aria-label="Max retry attempts"
                value={form.max_retry_attempts}
                onChange={(e) => set("max_retry_attempts", Number(e.target.value))}
                disabled={!canWrite}
              />
              <FieldError msg={errors.max_retry_attempts} />
            </FieldRow>
            <FieldRow label="Retry interval (s)" htmlFor="retry-interval">
              <Input
                id="retry-interval"
                type="number"
                aria-label="Retry interval"
                value={form.retry_interval_seconds}
                onChange={(e) => set("retry_interval_seconds", Number(e.target.value))}
                disabled={!canWrite}
              />
              <FieldError msg={errors.retry_interval_seconds} />
            </FieldRow>
          </Section>

          <Section title="Signature">
            <Textarea
              aria-label="Default email signature"
              value={form.signature}
              onChange={(e) => set("signature", e.target.value)}
              rows={4}
              placeholder="Best regards,\nProvintell HR"
              disabled={!canWrite}
            />
          </Section>
        </div>

        {/* ---- Live summary column ---- */}
        <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3 lg:sticky lg:top-4">
          <h4 className="text-label uppercase text-text-tertiary">Live summary</h4>
          <div className="text-small text-text-secondary">
            <p className="text-text-primary">
              {form.smtp_host || "—"}:{form.smtp_port}
            </p>
            <p>{form.encryption.toUpperCase()}</p>
            {form.use_auth && <p>auth as {form.smtp_username || "—"}</p>}
            <p className="mt-2">
              From: {form.sender_name || "—"} &lt;{form.sender_email || "—"}&gt;
            </p>
          </div>
          {hints.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
              {hints.map((h) => (
                <p key={h} className="flex items-start gap-1 text-small text-yellow">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </p>
              ))}
            </div>
          )}
          <div className="border-t border-border-subtle pt-2 text-small text-text-tertiary">
            <p className="flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-mint" /> Success: {fmt(cfg.last_success_at)}
            </p>
            <p className="flex items-center gap-1">
              <XCircle className="size-3.5 text-coral" /> Failure: {fmt(cfg.last_failure_at)}
            </p>
            {cfg.last_failure_message && (
              <p className="mt-1 text-coral">{cfg.last_failure_message}</p>
            )}
          </div>
        </div>
      </div>

      {canWrite && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-3">
          <Button type="button" variant="ghost" onClick={onTest} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTest(true)}
            disabled={sending}
          >
            <Send className="size-4" /> Send test email
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}

      <Dialog open={showTest} onOpenChange={setShowTest}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription>
              Sends a test message using the settings above (unsaved edits included).
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Recipient email"
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="you@example.com"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setShowTest(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSend} disabled={sending || !testRecipient}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-coral text-small mt-1">{msg}</p>
}

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-2 border-b border-border-subtle last:border-b-0 items-start">
      <label htmlFor={htmlFor} className="text-body text-text-primary pt-2">
        {label}
      </label>
      <div>{children}</div>
    </div>
  )
}
