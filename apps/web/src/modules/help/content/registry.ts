import { applyingForLeave } from "./articles/applying-for-leave"
import { contact } from "./articles/contact"
import { faqModules } from "./articles/faq-modules"
import { releaseNotes } from "./articles/release-notes"
import { troubleshootingEmail } from "./articles/troubleshooting-email"
import { welcome } from "./articles/welcome"
import type { HelpArticle, HelpCategory } from "./types"

export { HELP_CATEGORIES } from "./types"
export type { HelpArticle, HelpCategory } from "./types"

export const ARTICLES: HelpArticle[] = [
  welcome,
  applyingForLeave,
  faqModules,
  troubleshootingEmail,
  releaseNotes,
  contact,
]

export function articlesByCategory(cat: HelpCategory): HelpArticle[] {
  return ARTICLES.filter((a) => a.category === cat)
}

export function getArticle(slug: string): HelpArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}

export function searchArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase()
  if (!q) return ARTICLES
  return ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.toLowerCase().includes(q)),
  )
}
