import {
  Ban,
  CheckCircle2,
  Link2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Unlink,
  UserPlus,
  UserRound,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { DataTable, DetailPanel, StatusPill } from "@/components/hrms"
import type { Column } from "@/components/hrms/DataTable"
import { PageHeader } from "@/components/shell/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"

import { EffectiveAccessDrawer } from "../components/EffectiveAccessDrawer"
import { type UnlinkedEmployee, settingsApi } from "../settings/settings-api"
import { type AccountStatusFilter, type UserAccount, accountsApi } from "./accounts-api"

const FILTERS: { key: AccountStatusFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "disabled", label: "Disabled" },
  { key: "needs_linking", label: "Needs linking" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
]

function statusPill(row: UserAccount, filter: AccountStatusFilter) {
  if (filter === "archived") return { tone: "coral" as const, label: "Archived" }
  if (row.status === "disabled") return { tone: "yellow" as const, label: "Disabled" }
  if (row.status === "locked") return { tone: "coral" as const, label: "Locked" }
  return { tone: "mint" as const, label: "Active" }
}

export function AccountsPage() {
  const { user } = useAuth()
  const canDisable = useCan("user:disable")
  const canDelete = useCan("user:delete")
  const canLink = useCan("employee:write:org")
  const canCreate = useCan("user:create")

  const [filter, setFilter] = useState<AccountStatusFilter>("active")
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [drawerFor, setDrawerFor] = useState<UserAccount | null>(null)
  const [confirm, setConfirm] = useState<{ row: UserAccount; action: "delete" } | null>(null)
  const [linkFor, setLinkFor] = useState<UserAccount | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setRows(await accountsApi.list(filter))
    } catch {
      setError(true)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn()
      toast.success(label)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  const term = query.trim().toLowerCase()
  const visible = term
    ? rows.filter(
        (r) =>
          r.email.toLowerCase().includes(term) ||
          (r.employee?.full_name ?? "").toLowerCase().includes(term),
      )
    : rows
  const archived = filter === "archived"

  const columns: Column<UserAccount>[] = [
    {
      key: "email",
      header: "Account",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="size-7 rounded-lg grid place-items-center bg-lavender/20 text-lavender shrink-0">
            <UserRound className="size-4" />
          </span>
          <span className="text-text-primary">{r.email}</span>
        </div>
      ),
    },
    {
      key: "employee",
      header: "Linked employee",
      render: (r) =>
        r.employee ? (
          <span className="text-text-secondary">
            {r.employee.full_name}{" "}
            <span className="text-text-tertiary">· {r.employee.employee_code}</span>
          </span>
        ) : (
          <span className="text-text-tertiary italic">Unlinked</span>
        ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (r) =>
        r.role_codes.length ? (
          <div className="flex flex-wrap gap-1">
            {r.role_codes.map((c) => (
              <span
                key={c}
                className="text-[10px] rounded-md bg-surface-elevated/60 px-1.5 py-0.5 text-text-secondary"
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const p = statusPill(r, filter)
        return <StatusPill tone={p.tone} label={p.label} />
      },
    },
    {
      key: "mfa",
      header: "MFA",
      align: "center",
      render: (r) => (
        <span className={cn(r.mfa_enabled ? "text-mint" : "text-text-tertiary")}>
          {r.mfa_enabled ? "✓" : "—"}
        </span>
      ),
    },
    {
      key: "last_login",
      header: "Last login",
      render: (r) => (
        <span className="text-text-tertiary text-small">
          {r.last_login_at ? new Date(r.last_login_at).toLocaleDateString("en-MY") : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => {
        const isSelf = r.id === user?.id
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${r.email}`}
                className="size-7 grid place-items-center rounded-lg text-text-tertiary hover:bg-surface-elevated/60"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDrawerFor(r)}>
                <UserRound className="size-4 mr-2" /> View access
              </DropdownMenuItem>

              {archived
                ? canDelete && (
                    <DropdownMenuItem
                      onClick={() => run("Account restored", () => accountsApi.restore(r.id))}
                    >
                      <RotateCcw className="size-4 mr-2" /> Restore
                    </DropdownMenuItem>
                  )
                : canDisable &&
                  !isSelf &&
                  (r.status === "disabled" ? (
                    <DropdownMenuItem
                      onClick={() => run("Account enabled", () => accountsApi.enable(r.id))}
                    >
                      <CheckCircle2 className="size-4 mr-2" /> Enable
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => run("Account disabled", () => accountsApi.disable(r.id))}
                    >
                      <Ban className="size-4 mr-2" /> Disable
                    </DropdownMenuItem>
                  ))}

              {canLink &&
                !archived &&
                (r.employee ? (
                  <DropdownMenuItem
                    onClick={() =>
                      run("Employee unlinked", () => settingsApi.unlinkUser(r.employee?.id ?? ""))
                    }
                  >
                    <Unlink className="size-4 mr-2" /> Unlink employee
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setLinkFor(r)}>
                    <Link2 className="size-4 mr-2" /> Link employee
                  </DropdownMenuItem>
                ))}

              {!archived && canDelete && !isSelf && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirm({ row: r, action: "delete" })}
                    className="text-coral focus:text-coral"
                  >
                    <Trash2 className="size-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Accounts"
        subtitle="Manage login accounts — status, employee links, and access."
        actions={
          canCreate ? (
            <Button asChild className="soft-glow rounded-xl">
              <Link to="/admin/people/accounts/new">
                <UserPlus className="size-4 mr-1" /> New user
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl bg-surface-elevated/60 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "text-small rounded-lg px-3 py-1.5 transition-colors",
                filter === f.key
                  ? "bg-accent-500/20 text-accent-100"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or employee…"
          aria-label="Search accounts"
          className="h-8 min-w-[200px] flex-1 max-w-xs rounded-lg bg-surface-elevated/60 border border-border-subtle px-3 text-small text-text-primary"
        />
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : error ? (
        <div className="glass-surface rounded-2xl p-8 text-center">
          <p className="text-text-secondary">Couldn't load accounts.</p>
          <Button type="button" onClick={() => refresh()} className="mt-3">
            Retry
          </Button>
        </div>
      ) : (
        <DataTable<UserAccount>
          rows={visible}
          columns={columns}
          rowKey={(r) => r.id}
          emptyState={<p className="text-text-tertiary text-center py-8">No accounts found.</p>}
        />
      )}

      {drawerFor && (
        <EffectiveAccessDrawer
          userId={drawerFor.id}
          name={drawerFor.email}
          onClose={() => setDrawerFor(null)}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this account?"
        description={
          confirm
            ? `${confirm.row.email} will be archived and can no longer sign in. You can restore it later from the Archived filter.`
            : ""
        }
        confirmLabel="Delete account"
        variant="danger"
        onConfirm={() => {
          if (confirm) void run("Account deleted", () => accountsApi.remove(confirm.row.id))
          setConfirm(null)
        }}
      />

      <LinkEmployeePanel
        account={linkFor}
        onClose={() => setLinkFor(null)}
        onLinked={async () => {
          setLinkFor(null)
          await refresh()
        }}
      />
    </div>
  )
}

function LinkEmployeePanel({
  account,
  onClose,
  onLinked,
}: {
  account: UserAccount | null
  onClose: () => void
  onLinked: () => void | Promise<void>
}) {
  const [candidates, setCandidates] = useState<UnlinkedEmployee[] | null>(null)

  useEffect(() => {
    if (!account) return
    setCandidates(null)
    settingsApi
      .listUnlinkedEmployees()
      .then(setCandidates)
      .catch(() => setCandidates([]))
  }, [account])

  async function link(empId: string) {
    if (!account) return
    try {
      await settingsApi.linkUser(empId, account.id)
      toast.success("Employee linked")
      await onLinked()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link")
    }
  }

  return (
    <DetailPanel
      open={account !== null}
      onClose={onClose}
      title={account ? `Link an employee to ${account.email}` : "Link employee"}
    >
      {candidates === null ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : candidates.length === 0 ? (
        <p className="text-small text-text-tertiary">No unlinked employees available.</p>
      ) : (
        <ul className="space-y-1">
          {candidates.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => link(e.id)}
                className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-elevated/60"
              >
                <span className="min-w-0">
                  <span className="text-small text-text-primary">
                    {e.first_name} {e.last_name}
                  </span>{" "}
                  <span className="text-[11px] text-text-tertiary">· {e.employee_code}</span>
                </span>
                <Link2 className="size-4 text-text-tertiary shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  )
}
