import type { ReactNode } from "react"

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <h4 className="text-label uppercase text-text-tertiary mb-3">{title}</h4>
      {children}
    </div>
  )
}
