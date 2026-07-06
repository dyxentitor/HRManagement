import { HelpCircle } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import { EmptyState } from "@/components/hrms"

import { HELP_CATEGORIES, articlesByCategory } from "../content/registry"
import type { HelpCategory } from "../content/registry"

export default function HelpCategoryPage() {
  const { pathname } = useLocation()
  const key = pathname.split("/").pop() as HelpCategory
  const category = HELP_CATEGORIES.find((c) => c.key === key)
  const articles = articlesByCategory(key)
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h2 text-text-primary">{category?.label ?? "Help"}</h1>
      {articles.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="size-5" />}
          title="Nothing here yet"
          description="Articles for this section are coming soon."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link
                to={`/help/article/${a.slug}`}
                className="flex flex-col gap-0.5 rounded-md px-2 py-3 hover:bg-surface-hover"
              >
                <span className="text-body font-semibold text-text-primary">{a.title}</span>
                <span className="text-small text-text-tertiary">{a.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
