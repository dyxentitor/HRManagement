import { Prose } from "../Prose"
import type { HelpArticle } from "../types"

export const contact: HelpArticle = {
  slug: "contact-support",
  title: "Contact & support",
  category: "contact",
  keywords: ["contact", "support", "help", "email", "admin", "it"],
  summary: "How to reach an administrator for help.",
  updated: "2026-07-06",
  Body: () => (
    <Prose>
      <p>
        For access issues, account problems, or anything this guide doesn't cover, contact your HR
        administrator.
      </p>
      <ul>
        <li>
          Email: <a href="mailto:hr@provintell.com">hr@provintell.com</a>
        </li>
        <li>In person: your HR or IT team.</li>
      </ul>
    </Prose>
  ),
}
