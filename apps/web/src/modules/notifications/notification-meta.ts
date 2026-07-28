import {
  Award,
  Bell,
  CalendarDays,
  ClipboardList,
  Coins,
  Landmark,
  LineChart,
  Lock,
  Megaphone,
  MessageSquare,
  Palmtree,
  Receipt,
  Server,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react"
import type { ComponentType } from "react"

import type { Notification } from "./api"
import { eventDomain } from "./event-labels"

const DOMAIN_ICON: Record<string, ComponentType<{ className?: string }>> = {
  leave: Palmtree,
  claim: Receipt,
  kpi: LineChart,
  cert: Award,
  assignment: ClipboardList,
  incentive: Coins,
  announcement: Megaphone,
  payslip: Wallet,
  user: ShieldCheck,
  onboarding: UserPlus,
  schedule: CalendarDays,
  employee: Landmark,
  auth: Lock,
  feedback: MessageSquare,
  system: Server,
}

export function domainIcon(type: string): ComponentType<{ className?: string }> {
  return DOMAIN_ICON[eventDomain(type)] ?? Bell
}

/** Tailwind bg-class for the left priority rail + icon tint. */
const TONE: Record<string, string> = {
  urgent: "bg-coral",
  high: "bg-peach",
  normal: "bg-accent-500",
  low: "bg-text-tertiary/40",
}

export function priorityTone(priority: string): string {
  return TONE[priority] ?? "bg-accent-500"
}

const DESCRIPTION_KEYS = ["title", "project", "cert_name", "employee", "role_code", "reason"]

/** A concise one-line description pulled from the payload, or "" when none fits. */
export function notificationDescription(n: Notification): string {
  const p = (n.payload ?? {}) as Record<string, unknown>
  for (const key of DESCRIPTION_KEYS) {
    const v = p[key]
    if (typeof v === "string" && v.trim()) return v
  }
  return ""
}
