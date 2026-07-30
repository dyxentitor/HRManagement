import { Moon, Sun } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { LoginForm } from "../components/LoginForm"

function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img src="/logo.png" alt="Provintell" className="h-7 w-auto" />
      <span className="rounded-md border border-border-strong bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-text-tertiary">
        HRMS
      </span>
    </div>
  )
}

function ThemeToggle() {
  // Visual affordance to match the design; a full light-theme palette is a future enhancement.
  const [dark, setDark] = useState(true)
  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      aria-label="Toggle theme"
      className="grid size-10 place-items-center rounded-full border border-border-subtle bg-surface/60 text-text-secondary backdrop-blur-sm transition-colors hover:text-text-primary"
    >
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  )
}

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas text-text-primary">
      {/* Full-screen dimmed wallpaper */}
      <img
        src="/login-bg.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-canvas/75" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-r from-canvas/60 via-canvas/30 to-canvas/10"
        aria-hidden
      />

      <div className="absolute right-5 top-5 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* LEFT — brand + value props (over the wallpaper) */}
        <aside className="relative hidden overflow-hidden lg:flex lg:flex-col">
          <div className="relative z-10 flex h-full flex-col justify-between px-14 py-12">
            <Brand />

            <div className="max-w-xl">
              <h1 className="text-[44px] font-bold leading-[1.08] tracking-tight">
                Your HR system,
                <br />
                <span className="bg-gradient-to-r from-[#5eead4] via-[#2dd4bf] to-[#34d399] bg-clip-text text-transparent">
                  built for your office.
                </span>
              </h1>
              <p className="mt-4 max-w-md text-body text-text-secondary">
                Secure. Intelligent. Effortless. Manage your people, processes and payroll in one
                powerful platform.
              </p>
            </div>

            <p className="text-small text-text-tertiary">
              © {new Date().getFullYear()} All Rights Reserved, By Provintell Technologies Sdn.
              Bhd.
            </p>
          </div>
        </aside>

        {/* RIGHT — sign-in card */}
        <section className="relative flex flex-col px-6 py-10 sm:px-10">
          <Brand className="mb-10 lg:hidden" />

          <div className="grid flex-1 place-items-center">
            <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface/70 p-7 shadow-modal backdrop-blur-xl sm:p-8">
              <LoginForm />
            </div>
          </div>

          <footer className="mt-10 flex flex-col items-center gap-2 text-small text-text-tertiary sm:flex-row sm:justify-end">
            <span className="lg:hidden">
              © {new Date().getFullYear()} All Rights Reserved, By Provintell Technologies Sdn. Bhd.
            </span>
            <nav className="flex items-center gap-4">
              <Link to="/legal/privacy" className="transition-colors hover:text-text-secondary">
                Privacy Policy
              </Link>
              <Link to="/legal/terms" className="transition-colors hover:text-text-secondary">
                Terms of Service
              </Link>
              <Link to="/legal/security" className="transition-colors hover:text-text-secondary">
                Security
              </Link>
            </nav>
          </footer>
        </section>
      </div>
    </main>
  )
}
