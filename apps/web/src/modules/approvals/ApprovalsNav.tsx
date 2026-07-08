import { NavLink } from "react-router-dom"

import { useCan } from "@/lib/perm"
import { cn } from "@/lib/utils"

import {
  APPROVALS_NAV_ITEMS,
  type ApprovalsCountKey,
  type ApprovalsNavItem,
} from "./approvals-nav-config"

/** Left-nav panel for the Approval Center — mirrors PeopleNav / SettingsNav.
 * Desktop: a 220px vertical aside. Below md: a horizontal, swipeable pill row. */
export function ApprovalsNav({ counts }: { counts: Record<ApprovalsCountKey, number> }) {
  // All useCan calls unconditional (rules of hooks); combined per item below.
  const canClaimTeam = useCan("claim:approve:team")
  const canClaimFinance = useCan("claim:approve:finance")
  const canLeave = useCan("leave:request:approve:team")
  const permByKey: Record<ApprovalsCountKey, boolean> = {
    all: true, // always visible landing
    claim: canClaimTeam || canClaimFinance,
    leave: canLeave,
    kpi: false, // KPI has no dedicated perm — visible only when items exist
  }

  const visible = APPROVALS_NAV_ITEMS.filter(
    (item) => permByKey[item.countKey] || counts[item.countKey] > 0,
  )

  return (
    <aside className="flex flex-col bg-surface rounded-lg p-3 md:w-[220px] shrink-0">
      <div className="hidden md:block px-2 pt-1 pb-3 mb-2 border-b border-border-subtle">
        <h2 className="text-h4 font-bold text-text-primary">Approvals</h2>
      </div>
      <nav className="flex md:flex-col gap-1 md:gap-0.5 overflow-x-auto md:overflow-visible">
        {visible.map((item) => (
          <NavItemRow key={item.to} item={item} count={counts[item.countKey]} />
        ))}
      </nav>
    </aside>
  )
}

function NavItemRow({ item, count }: { item: ApprovalsNavItem; count: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-body whitespace-nowrap shrink-0",
          isActive
            ? "bg-accent-500/15 text-text-primary font-semibold"
            : "text-text-secondary hover:bg-surface-hover",
        )
      }
    >
      <item.icon className="w-4 h-4" />
      <span className="flex-1">{item.label}</span>
      {count > 0 && (
        <span className="text-[10px] font-bold text-white bg-coral px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
          {count}
        </span>
      )}
    </NavLink>
  )
}
