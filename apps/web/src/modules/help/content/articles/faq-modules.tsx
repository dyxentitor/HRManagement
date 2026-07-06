import { Prose } from "../Prose"
import type { HelpArticle } from "../types"

export const faqModules: HelpArticle = {
  slug: "faq-why-cant-i-see-a-module",
  title: "Why can't I see a module?",
  category: "faqs",
  keywords: ["missing", "module", "hidden", "sidebar", "permission", "access"],
  summary: "Modules can be hidden by your role or turned off for the organization.",
  updated: "2026-07-06",
  Body: () => (
    <Prose>
      <p>Two things control what you see:</p>
      <ul>
        <li>
          <strong>Your role's permissions</strong> — some pages are limited to specific roles.
        </li>
        <li>
          <strong>Organization module settings</strong> — an admin can turn a whole module off.
        </li>
      </ul>
      <p>
        If you expect access and don't have it, contact an administrator (see Contact &amp;
        Support).
      </p>
    </Prose>
  ),
}
