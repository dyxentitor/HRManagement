import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Building2, ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/hrms"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { Tone } from "@/modules/schedule/lib/cell-tone"

import { OrgNodeCard } from "./OrgNodeCard"
import { orgChartApi } from "./api"
import { departmentTone } from "./dept-color"
import { type OrgFilters, hasActiveFilters, matchesFilters } from "./org-chart-filters"
import type { DepartmentGroup } from "./types"

const TONE_HEADER: Record<Tone, string> = {
  accent: "bg-accent-500/10",
  lavender: "bg-lavender/10",
  sky: "bg-sky/10",
  yellow: "bg-yellow/10",
  mint: "bg-mint/10",
  peach: "bg-peach/10",
  coral: "bg-coral/10",
}

export interface DepartmentViewProps {
  filters: OrgFilters
  onFocus: (id: string) => void
}

export function DepartmentView({ filters, onFocus }: DepartmentViewProps) {
  const deptsQ = useQuery({ queryKey: ["org-depts"], queryFn: orgChartApi.departments })

  if (deptsQ.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    )
  }
  if (deptsQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle className="size-6" />}
        title="Couldn't load departments"
        description="Something went wrong."
        action={
          <Button type="button" onClick={() => deptsQ.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }
  const depts = deptsQ.data ?? []
  if (depts.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="No departments"
        description="No departments with employees were found."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {depts.map((d) => (
        <DepartmentSection key={d.id} dept={d} filters={filters} onFocus={onFocus} />
      ))}
    </div>
  )
}

function DepartmentSection({
  dept,
  filters,
  onFocus,
}: {
  dept: DepartmentGroup
  filters: OrgFilters
  onFocus: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const tone = departmentTone(dept.id)
  const membersQ = useQuery({
    queryKey: ["org-dept-members", dept.id],
    queryFn: () => orgChartApi.departmentMembers(dept.id),
    enabled: open,
  })
  const members = (membersQ.data ?? []).filter((m) => matchesFilters(m, filters))
  const hiddenByFilter = open && hasActiveFilters(filters) && members.length === 0

  return (
    <section className="glass-surface rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full flex items-center gap-2 px-4 py-3 text-left", TONE_HEADER[tone])}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="text-body font-semibold text-text-primary">{dept.name}</span>
        <span className="text-small text-text-tertiary">{dept.head_count}</span>
      </button>

      {open && (
        <div className="p-4">
          {membersQ.isLoading && <Skeleton className="h-24 rounded-2xl" />}
          {membersQ.isError && (
            <button
              type="button"
              onClick={() => membersQ.refetch()}
              className="text-small text-coral hover:underline"
            >
              Failed to load members — retry
            </button>
          )}
          {hiddenByFilter && (
            <p className="text-small text-text-tertiary">No members match the active filters.</p>
          )}
          {members.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {members.map((m) => (
                <OrgNodeCard key={m.id} node={m} onFocus={onFocus} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
