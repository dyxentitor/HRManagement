import type { Tone } from "@/modules/schedule/lib/cell-tone"

// Departments have no colour in the data model, so we derive a stable pastel per
// department deterministically (same key → same tone across the session).
const PALETTE: Tone[] = ["lavender", "sky", "yellow", "mint", "peach", "coral"]

export function departmentTone(key: string | null | undefined): Tone {
  const s = key ?? ""
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100000
  return PALETTE[h % PALETTE.length]
}
