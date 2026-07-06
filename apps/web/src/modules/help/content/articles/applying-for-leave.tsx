import { Prose } from "../Prose"
import type { HelpArticle } from "../types"

export const applyingForLeave: HelpArticle = {
  slug: "applying-for-leave",
  title: "Applying for leave",
  category: "guides",
  keywords: ["leave", "annual", "sick", "time off", "request", "approval"],
  summary: "Submit a leave request and track its approval.",
  updated: "2026-07-06",
  Body: () => (
    <Prose>
      <h3>Submit a request</h3>
      <p>
        Open <strong>Leave → Apply</strong>, choose a leave type and dates, and submit. Your
        remaining balance is shown before you confirm.
      </p>
      <h3>Track approval</h3>
      <p>
        Watch the request status under <strong>Leave → My Leave</strong>. You'll get a notification
        when it's approved or rejected.
      </p>
    </Prose>
  ),
}
