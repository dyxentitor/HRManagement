import { Link } from "react-router-dom"

export interface LegalDoc {
  title: string
  intro: string
}

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy describes how Provintell collects, uses, and protects the personal data held in this HR system.",
  },
  terms: {
    title: "Terms of Service",
    intro: "These terms govern authorised access to and use of the Provintell HR system.",
  },
  security: {
    title: "Security",
    intro: "An overview of the safeguards protecting the data held in the Provintell HR system.",
  },
}

export default function LegalPage({ doc }: { doc: keyof typeof LEGAL_DOCS }) {
  const content = LEGAL_DOCS[doc]

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas text-text-primary">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: `
						linear-gradient(to right, rgb(255 255 255 / 0.045) 1px, transparent 1px),
						linear-gradient(to bottom, rgb(255 255 255 / 0.045) 1px, transparent 1px)
					`,
          backgroundSize: "80px 80px",
          backgroundPosition: "center -100px",
          maskImage: "linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
        <article className="rounded-xl border border-border-subtle bg-surface/60 p-8 shadow-modal backdrop-blur-sm">
          <header className="mb-6">
            <h1 className="text-h1 text-text-primary">{content.title}</h1>
            <p className="mt-2 text-body text-text-secondary">{content.intro}</p>
          </header>

          <div className="space-y-4 text-body text-text-secondary">
            <p>
              The full, formally approved version of this document is being finalised. In the
              meantime, the complete policy is available on request.
            </p>
            <p>
              For a copy, or with any questions about your data and rights, please contact your HR
              administrator through your organisation's usual channels.
            </p>
          </div>

          <footer className="mt-8 border-t border-border-subtle pt-6">
            <Link to="/login" className="text-small text-accent-200 hover:text-accent-50">
              ← Back to sign in
            </Link>
          </footer>
        </article>
      </div>
    </main>
  )
}
