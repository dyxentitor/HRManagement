// Shared avatar gradient + status-tone helpers, extracted from EmployeeCard so the
// Organization Chart node cards render identical avatars/status pills. Behaviour is
// unchanged from the original EmployeeCard implementation.

export type PillTone = "mint" | "yellow" | "coral" | "sky" | "lavender" | "peach"

const PALETTES: [string, string][] = [
  ["peach", "coral"],
  ["lavender", "sky"],
  ["mint", "yellow"],
  ["yellow", "peach"],
  ["sky", "lavender"],
]

export function gradientFromName(name: string): [string, string] {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTES[hash % PALETTES.length] ?? ["lavender", "sky"]
}

const STATUS_TONES: Record<string, { tone: PillTone; label: string }> = {
  active: { tone: "mint", label: "Active" },
  probation: { tone: "yellow", label: "Probation" },
  on_leave: { tone: "sky", label: "On leave" },
  suspended: { tone: "coral", label: "Suspended" },
  inactive: { tone: "lavender", label: "Inactive" },
  terminated: { tone: "lavender", label: "Terminated" },
  resigned: { tone: "peach", label: "Resigned" },
}

export function employeeStatusTone(status?: string): { tone: PillTone; label: string } {
  if (!status) return { tone: "mint", label: "Active" }
  return (
    STATUS_TONES[status] ?? {
      tone: "lavender",
      label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  )
}
