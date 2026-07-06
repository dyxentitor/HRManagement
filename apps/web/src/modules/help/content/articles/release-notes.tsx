import { Prose } from "../Prose"
import type { HelpArticle } from "../types"

export const releaseNotes: HelpArticle = {
  slug: "release-notes",
  title: "Release notes",
  category: "release-notes",
  keywords: ["changelog", "release", "updates", "new", "version", "what's new"],
  summary: "Recent notable changes to the portal.",
  updated: "2026-07-06",
  Body: () => (
    <Prose>
      <h3>Latest</h3>
      <ul>
        <li>
          <strong>Notifications</strong> — the bell now shows unread counts and a live dropdown.
        </li>
        <li>
          <strong>Help Center</strong> — this documentation area.
        </li>
        <li>
          <strong>Email configuration</strong> — admins can configure SMTP under System Settings.
        </li>
      </ul>
      <p>For the full history, see the project CHANGELOG.</p>
    </Prose>
  ),
}
