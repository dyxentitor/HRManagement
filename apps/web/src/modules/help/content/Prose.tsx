import type { ReactNode } from "react"

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 text-body text-text-secondary [&_a]:text-accent-300 [&_h3]:mt-2 [&_h3]:text-h4 [&_h3]:font-semibold [&_h3]:text-text-primary [&_ul]:list-disc [&_ul]:pl-5">
      {children}
    </div>
  )
}
