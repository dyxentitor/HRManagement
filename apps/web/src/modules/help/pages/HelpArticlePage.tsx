import { HelpCircle } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { EmptyState } from "@/components/hrms"

import { getArticle } from "../content/registry"

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = slug ? getArticle(slug) : undefined
  if (!article) {
    return (
      <EmptyState
        icon={<HelpCircle className="size-5" />}
        title="Article not found"
        description="It may have moved or been renamed."
      />
    )
  }
  const { Body } = article
  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <Link to="/help" className="text-small text-accent-300 hover:text-accent-200">
        ← Back to Help
      </Link>
      <div>
        <h1 className="text-h2 text-text-primary">{article.title}</h1>
        <p className="text-small text-text-tertiary">Updated {article.updated}</p>
      </div>
      <Body />
    </article>
  )
}
