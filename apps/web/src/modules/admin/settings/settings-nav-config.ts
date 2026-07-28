import {
  Archive,
  Building2,
  KeyRound,
  Landmark,
  LayoutGrid,
  Mail,
  Palmtree,
  ScrollText,
  Settings2,
  Users,
} from "lucide-react"
import type { ComponentType } from "react"

export type SettingsNavBadge = "unlinked_users"

export interface SettingsNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  perm: string
  isNewInV190?: boolean
  badge?: SettingsNavBadge
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    to: "/admin/settings",
    label: "Overview",
    icon: LayoutGrid,
    perm: "role:read",
  },
  {
    to: "/admin/settings/organization",
    label: "Organization",
    icon: Building2,
    perm: "org:settings:write",
    isNewInV190: true,
  },
  {
    to: "/admin/settings/email-notifications",
    label: "Email Notifications",
    icon: Mail,
    perm: "org:email_config:read",
    isNewInV190: true,
  },
  {
    to: "/admin/settings/email-templates",
    label: "Email Templates",
    icon: Mail,
    perm: "org:email_config:read",
  },
  {
    to: "/admin/settings/modules",
    label: "Modules",
    icon: Settings2,
    perm: "org:feature_flag:read",
  },
  {
    to: "/admin/settings/departments",
    label: "Departments",
    icon: Landmark,
    perm: "department:read",
    isNewInV190: true,
  },
  {
    to: "/admin/settings/teams",
    label: "Teams",
    icon: Users,
    perm: "team:write",
  },
  {
    to: "/admin/settings/archived",
    label: "Archived",
    icon: Archive,
    perm: "employee:archive",
    isNewInV190: true,
  },
  {
    to: "/admin/settings/roles",
    label: "Roles & Perms",
    icon: KeyRound,
    perm: "role:read",
  },
  {
    to: "/admin/settings/leave-types",
    label: "Leave Types",
    icon: Palmtree,
    perm: "leave:type:write",
  },
  {
    to: "/admin/settings/audit",
    label: "Audit Log",
    icon: ScrollText,
    perm: "audit:read:org",
  },
]
