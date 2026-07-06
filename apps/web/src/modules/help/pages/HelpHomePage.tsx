import { Search } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { EmptyState } from "@/components/hrms"

import { searchArticles } from "../content/registry"

export default function HelpHomePage() {
  const [q, setQ] = useState("")
  const results = searchArticles(q)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-h2 text-text-primary">How can we help?</h1>
        <p className="text-body text-text-tertiary">
          Search the knowledge base or browse by category.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-canvas px-4 py-2">
        <Search className="size-4 text-text-tertiary" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help articles…"
          aria-label="Search help articles"
          className="w-full bg-transparent text-body text-text-secondary focus:outline-none"
        />
      </div>
      {results.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title="No results"
          description="Try a different search term."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {results.map((a) => (
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
