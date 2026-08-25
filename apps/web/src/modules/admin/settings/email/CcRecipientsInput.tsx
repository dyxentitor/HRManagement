import { Plus, X } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { RoutingToken } from "@/modules/admin/settings/notification-routing-api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidCcEntry(entry: string, tokens: RoutingToken[]): boolean {
  if (entry.startsWith("{") && entry.endsWith("}")) {
    return tokens.some((t) => t.token === entry)
  }
  return EMAIL_RE.test(entry)
}

function labelFor(entry: string, tokens: RoutingToken[]): string {
  return tokens.find((t) => t.token === entry)?.label ?? entry
}

export function CcRecipientsInput(props: {
  value: string[]
  tokens: RoutingToken[]
  onChange: (next: string[]) => void
  disabled?: boolean
  id?: string
}) {
  const { value, tokens, onChange, disabled, id } = props
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    const entry = draft.trim()
    if (!entry) {
      setDraft("")
      return
    }
    if (!isValidCcEntry(entry, tokens)) {
      setError("Enter a valid email address or select a token")
      return
    }
    const isDuplicate = value.some((v) => v.toLowerCase() === entry.toLowerCase())
    if (isDuplicate) {
      setDraft("")
      setError(null)
      return
    }
    onChange([...value, entry])
    setDraft("")
    setError(null)
  }

  const remove = (entry: string) => {
    onChange(value.filter((v) => v !== entry))
  }

  const availableTokens = tokens.filter((t) => !value.includes(t.token))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2 py-1.5">
        {value.map((entry) => {
          const label = labelFor(entry, tokens)
          return (
            <span
              key={entry}
              className="flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-small text-text-secondary"
            >
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                disabled={disabled}
                onClick={() => remove(entry)}
                className="rounded-full p-0.5 hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          )
        })}
        <Input
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === ",") {
              e.preventDefault()
              commit()
            }
          }}
          // Committing on blur too. Without it a user types an address, clicks
          // Save, and the draft is silently discarded. `commit()` no-ops on an
          // empty/whitespace draft, so merely tabbing through never raises a
          // validation error.
          onBlur={commit}
          placeholder="Add email address"
          className="h-7 min-w-[10rem] flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Add recipient token"
              disabled={disabled}
              className="flex items-center justify-center rounded-full p-1 text-text-secondary hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableTokens.map((t) => (
              <DropdownMenuItem key={t.token} onSelect={() => onChange([...value, t.token])}>
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? <p className="text-coral text-small">{error}</p> : null}
    </div>
  )
}
