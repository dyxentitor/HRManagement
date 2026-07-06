import { useCallback, useState } from "react"

/** Expand/collapse state for lazily-loaded tree branches (by employee id). */
export function useOrgTree() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandPath = useCallback((ids: string[]) => {
    setExpanded((prev) => new Set([...prev, ...ids]))
  }, [])

  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded])

  return { expanded, toggle, isExpanded, expandPath }
}
