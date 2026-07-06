import { Prose } from "../Prose"
import type { HelpArticle } from "../types"

export const welcome: HelpArticle = {
  slug: "welcome",
  title: "Welcome to the HR Portal",
  category: "getting-started",
  keywords: ["start", "overview", "login", "getting started", "intro"],
  summary: "What the portal does and how to sign in for the first time.",
  updated: "2026-07-06",
  Body: () => (
    <Prose>
      <p>The HR portal is where you manage leave, claims, schedules, payslips, and your profile.</p>
      <h3>Signing in</h3>
      <p>
        Use your company email and password. If it's your first time, use the activation link sent
        to your inbox, or ask an administrator to resend it.
      </p>
      <h3>Finding your way around</h3>
      <p>
        The left sidebar groups every module. The top bar has search (⌘K), notifications, help, and
        your account menu.
      </p>
    </Prose>
  ),
}
