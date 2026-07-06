import type { ComponentType } from "react"

export type HelpCategory =
  | "getting-started"
  | "guides"
  | "faqs"
  | "troubleshooting"
  | "release-notes"
  | "contact"

export interface HelpArticle {
  slug: string
  title: string
  category: HelpCategory
  keywords: string[]
  summary: string
  updated: string
  Body: ComponentType
}

export const HELP_CATEGORIES: { key: HelpCategory; label: string }[] = [
  { key: "getting-started", label: "Getting Started" },
  { key: "guides", label: "Guides & Walkthroughs" },
  { key: "faqs", label: "FAQs" },
  { key: "troubleshooting", label: "Troubleshooting" },
  { key: "release-notes", label: "Release Notes" },
  { key: "contact", label: "Contact & Support" },
]
