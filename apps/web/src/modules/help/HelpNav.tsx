import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"

import { HELP_NAV_ITEMS } from "./help-nav-config"

export function HelpNav() {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col rounded-lg bg-surface p-3">
      <div className="mb-2 border-b border-border-subtle px-2 pb-3 pt-1">
        <h2 className="text-h4 font-bold text-text-primary">Help Center</h2>
      </div>
      <nav className="flex flex-col gap-0.5">
        {HELP_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/help"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body",
                isActive
                  ? "bg-accent-500/15 font-semibold text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
