import { Prose } from "../Prose"
import type { HelpArticle } from "../types"

export const troubleshootingEmail: HelpArticle = {
  slug: "troubleshooting-test-email-failed",
  title: "A test email failed (SMTP error)",
  category: "troubleshooting",
  keywords: ["email", "smtp", "5.7.139", "microsoft 365", "authentication", "test email"],
  summary: "What a 5.7.139 authentication error means and how to fix it.",
  updated: "2026-07-06",
  Body: () => (
    <Prose>
      <p>
        If a test email returns <code>5.7.139 Authentication unsuccessful</code>, the SMTP server
        rejected the credentials. For Microsoft 365:
      </p>
      <ul>
        <li>
          Enable <strong>Authenticated SMTP</strong> for the mailbox.
        </li>
        <li>
          If the account uses MFA, use an <strong>app password</strong>, not the login password.
        </li>
        <li>Use the full email address as the username.</li>
      </ul>
      <p>
        Alternatively, use a relay such as SendGrid, Amazon SES, or Mailgun (API key as the
        password).
      </p>
    </Prose>
  ),
}
