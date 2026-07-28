import { FileText, RotateCcw, Save, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"
import { useCan } from "@/lib/perm"

import { emailConfigApi } from "../email-config-api"
import {
  type EmailTemplateDetail,
  type EmailTemplateSummary,
  emailTemplateApi,
} from "../email-template-api"
import { Section } from "./Section"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandingForm {
  accent_color: string
  header_html: string
  footer_html: string
  signature: string
}

const EMPTY_BRANDING: BrandingForm = {
  accent_color: "",
  header_html: "",
  footer_html: "",
  signature: "",
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export default function EmailTemplatesTab() {
  const canRead = useCan("org:email_config:read")
  const canWrite = useCan("org:email_config:write")

  // Template list
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<EmailTemplateDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Editor form
  const [subject, setSubject] = useState("")
  const [htmlBody, setHtmlBody] = useState("")
  const [textBody, setTextBody] = useState("")

  // Live preview
  const [preview, setPreview] = useState<{ subject: string; text: string; html: string } | null>(
    null,
  )
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Actions
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showSendTest, setShowSendTest] = useState(false)
  const [testRecipient, setTestRecipient] = useState("")
  const [sending, setSending] = useState(false)

  // Branding
  const [branding, setBranding] = useState<BrandingForm>(EMPTY_BRANDING)
  const [savingBranding, setSavingBranding] = useState(false)

  // ---------------------------------------------------------------------------
  // Load template list
  // ---------------------------------------------------------------------------
  const loadList = useCallback(async () => {
    if (!canRead) return
    try {
      const list = await emailTemplateApi.list()
      setTemplates(list)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates")
    }
  }, [canRead])

  // Load branding from email config
  const loadBranding = useCallback(async () => {
    if (!canRead) return
    try {
      const cfg = await emailConfigApi.get()
      setBranding({
        accent_color: cfg.accent_color ?? "",
        header_html: cfg.header_html ?? "",
        footer_html: cfg.footer_html ?? "",
        signature: cfg.signature ?? "",
      })
    } catch {
      // branding fields may not exist yet — fail silently
    }
  }, [canRead])

  useEffect(() => {
    loadList()
    loadBranding()
  }, [loadList, loadBranding])

  // ---------------------------------------------------------------------------
  // Load individual template
  // ---------------------------------------------------------------------------
  const loadDetail = useCallback(async (key: string) => {
    setLoadingDetail(true)
    setDetail(null)
    setPreview(null)
    try {
      const d = await emailTemplateApi.get(key)
      setDetail(d)
      setSubject(d.subject)
      setHtmlBody(d.html_body)
      setTextBody(d.text_body)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load template")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  function selectTemplate(key: string) {
    setSelectedKey(key)
    loadDetail(key)
  }

  // ---------------------------------------------------------------------------
  // Debounced live preview
  // ---------------------------------------------------------------------------
  const schedulePreview = useCallback((key: string, s: string, h: string, t: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(async () => {
      try {
        const p = await emailTemplateApi.preview(key, {
          subject: s,
          html_body: h,
          text_body: t,
        })
        setPreview(p)
      } catch {
        // preview errors are non-blocking
      }
    }, 600)
  }, [])

  // Fire preview whenever editor fields change
  useEffect(() => {
    if (!selectedKey) return
    schedulePreview(selectedKey, subject, htmlBody, textBody)
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    }
  }, [selectedKey, subject, htmlBody, textBody, schedulePreview])

  // ---------------------------------------------------------------------------
  // Save template
  // ---------------------------------------------------------------------------
  async function onSave() {
    if (!selectedKey || !detail) return
    setSaving(true)
    try {
      const updated = await emailTemplateApi.save(selectedKey, {
        subject,
        text_body: textBody,
        html_body: htmlBody,
      })
      setDetail(updated)
      // Refresh list to update has_override badge
      await loadList()
      toast.success("Template saved")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Reset to default
  // ---------------------------------------------------------------------------
  async function onReset() {
    if (!selectedKey) return
    setResetting(true)
    try {
      await emailTemplateApi.reset(selectedKey)
      await loadDetail(selectedKey)
      await loadList()
      toast.success("Template reset to default")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setResetting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Send test
  // ---------------------------------------------------------------------------
  async function onSendTest() {
    if (!selectedKey || !testRecipient) return
    setSending(true)
    try {
      const res = await emailTemplateApi.sendTest(selectedKey, testRecipient)
      if (res.success) toast.success(res.detail || res.message)
      else toast.error(res.detail || res.message)
      setShowSendTest(false)
      setTestRecipient("")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send test email")
    } finally {
      setSending(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Save branding
  // ---------------------------------------------------------------------------
  async function onSaveBranding() {
    setSavingBranding(true)
    try {
      await emailConfigApi.patch(branding)
      toast.success("Branding saved")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Branding save failed")
    } finally {
      setSavingBranding(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Permission gate
  // ---------------------------------------------------------------------------
  if (!canRead) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-text-tertiary">
          You don&apos;t have permission to view email templates.
        </p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------------------ */}
      {/* Two-column layout: list + editor                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
        {/* --- Template list --- */}
        <nav aria-label="Email templates" className="flex flex-col gap-1">
          {templates.length === 0 && (
            <p className="text-small text-text-tertiary px-2">No templates found.</p>
          )}
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTemplate(t.key)}
              aria-current={selectedKey === t.key ? "true" : undefined}
              className={[
                "flex items-center justify-between gap-2 w-full rounded-lg px-3 py-2 text-left text-body transition-colors",
                selectedKey === t.key
                  ? "bg-accent-500/15 text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover",
              ].join(" ")}
            >
              <span className="flex items-center gap-2 min-w-0">
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </span>
              {t.has_override && (
                <span className="shrink-0 rounded-full bg-accent-500/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-400 uppercase tracking-wide">
                  custom
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* --- Editor panel --- */}
        <div className="flex flex-col gap-5">
          {!selectedKey && (
            <div className="rounded-lg border border-border-subtle bg-surface p-8 text-center text-text-tertiary text-small">
              Select a template on the left to edit it.
            </div>
          )}

          {selectedKey && loadingDetail && (
            <div className="rounded-lg border border-border-subtle bg-surface p-8 text-center text-text-tertiary text-small">
              Loading…
            </div>
          )}

          {selectedKey && !loadingDetail && detail && (
            <>
              {/* Placeholder reference */}
              {detail.placeholders.length > 0 && (
                <Section title="Available Placeholders">
                  <div className="flex flex-wrap gap-2">
                    {detail.placeholders.map((p) => (
                      <div
                        key={p.name}
                        title={p.description}
                        className="flex items-baseline gap-1.5 rounded-md border border-border-subtle bg-surface-hover px-2 py-1 text-small"
                      >
                        <code className="font-mono text-accent-400">{`{{${p.name}}}`}</code>
                        <span className="text-text-tertiary">— {p.description}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Editor */}
              <Section title="Editor">
                <FieldRow label="Subject" htmlFor="tpl-subject">
                  <Input
                    id="tpl-subject"
                    aria-label="Email subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={!canWrite}
                    placeholder="e.g. Your leave request has been approved"
                  />
                </FieldRow>
                <FieldRow label="HTML body" htmlFor="tpl-html">
                  <Textarea
                    id="tpl-html"
                    aria-label="HTML body"
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                    rows={12}
                    disabled={!canWrite}
                    placeholder="(using default HTML body)"
                    className="font-mono text-small"
                  />
                </FieldRow>
                <FieldRow label="Plain text body" htmlFor="tpl-text">
                  <Textarea
                    id="tpl-text"
                    aria-label="Plain text body"
                    value={textBody}
                    onChange={(e) => setTextBody(e.target.value)}
                    rows={6}
                    disabled={!canWrite}
                    placeholder="(using default plain-text body)"
                    className="font-mono text-small"
                  />
                </FieldRow>
              </Section>

              {/* Action bar */}
              {canWrite && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onReset}
                    disabled={resetting || !detail.has_override}
                    title={
                      detail.has_override
                        ? "Discard customisations and restore the built-in default"
                        : "Already using the default"
                    }
                  >
                    <RotateCcw className="size-3.5" />
                    {resetting ? "Resetting…" : "Reset to default"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSendTest(true)}
                  >
                    <Send className="size-3.5" /> Send test
                  </Button>
                  <div className="flex-1" />
                  <Button type="button" size="sm" onClick={onSave} disabled={saving}>
                    <Save className="size-3.5" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}

              {/* Live preview */}
              <Section title="Live Preview">
                {!preview && (
                  <p className="text-small text-text-tertiary">
                    Preview will appear here as you type…
                  </p>
                )}
                {preview && (
                  <div className="flex flex-col gap-3">
                    <div className="rounded border border-border-subtle bg-surface-hover px-3 py-2 text-small">
                      <span className="text-text-tertiary">Subject: </span>
                      <span className="text-text-primary">{preview.subject}</span>
                    </div>
                    <div>
                      <p className="text-label uppercase text-text-tertiary mb-1">HTML render</p>
                      <iframe
                        title="Email HTML preview"
                        srcDoc={preview.html}
                        sandbox=""
                        className="w-full rounded border border-border-subtle bg-white"
                        style={{ minHeight: 320, height: 420 }}
                      />
                    </div>
                    <div>
                      <p className="text-label uppercase text-text-tertiary mb-1">Plain text</p>
                      <pre className="whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-hover p-3 text-small text-text-secondary font-mono">
                        {preview.text}
                      </pre>
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Branding section                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t border-border-subtle pt-5 flex flex-col gap-5">
        <div>
          <h3 className="text-heading text-text-primary">Email Branding</h3>
          <p className="text-small text-text-tertiary mt-0.5">
            Applied to all outgoing emails. Empty fields use the built-in defaults.
          </p>
        </div>
        <Section title="Branding">
          <FieldRow label="Accent colour" htmlFor="branding-accent">
            <div className="flex items-center gap-2">
              <input
                id="branding-accent"
                type="color"
                aria-label="Accent colour"
                value={branding.accent_color || "#6d5aee"}
                onChange={(e) => setBranding((b) => ({ ...b, accent_color: e.target.value }))}
                disabled={!canWrite}
                className="h-9 w-12 cursor-pointer rounded border border-border-subtle bg-transparent p-0.5 disabled:opacity-50"
              />
              <Input
                aria-label="Accent colour hex"
                value={branding.accent_color}
                onChange={(e) => setBranding((b) => ({ ...b, accent_color: e.target.value }))}
                placeholder="(using default — e.g. #6d5aee)"
                disabled={!canWrite}
                className="max-w-[200px]"
              />
            </div>
          </FieldRow>
          <FieldRow label="Header HTML" htmlFor="branding-header">
            <Textarea
              id="branding-header"
              aria-label="Header HTML"
              value={branding.header_html}
              onChange={(e) => setBranding((b) => ({ ...b, header_html: e.target.value }))}
              rows={4}
              disabled={!canWrite}
              placeholder="(using default header)"
              className="font-mono text-small"
            />
          </FieldRow>
          <FieldRow label="Footer HTML" htmlFor="branding-footer">
            <Textarea
              id="branding-footer"
              aria-label="Footer HTML"
              value={branding.footer_html}
              onChange={(e) => setBranding((b) => ({ ...b, footer_html: e.target.value }))}
              rows={4}
              disabled={!canWrite}
              placeholder="(using default footer)"
              className="font-mono text-small"
            />
          </FieldRow>
          <FieldRow label="Signature" htmlFor="branding-sig">
            <Textarea
              id="branding-sig"
              aria-label="Email signature"
              value={branding.signature}
              onChange={(e) => setBranding((b) => ({ ...b, signature: e.target.value }))}
              rows={3}
              disabled={!canWrite}
              placeholder="(using default signature)"
            />
          </FieldRow>
        </Section>
        {canWrite && (
          <div className="flex justify-end border-t border-border-subtle pt-3">
            <Button type="button" onClick={onSaveBranding} disabled={savingBranding}>
              {savingBranding ? "Saving…" : "Save branding"}
            </Button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Send test dialog                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={showSendTest} onOpenChange={setShowSendTest}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription>
              Renders this template with sample data and sends it to the address below.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Recipient email address"
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="you@example.com"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setShowSendTest(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSendTest} disabled={sending || !testRecipient.trim()}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local layout components
// ---------------------------------------------------------------------------

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
