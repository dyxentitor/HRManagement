import { CheckCircle2, Lock, ShieldCheck, Users } from "lucide-react";

import { LoginForm } from "../components/LoginForm";

export default function LoginPage() {
	return (
		<main className="relative min-h-screen overflow-hidden bg-canvas text-text-primary">
			{/* Atmospheric grid + corner glow */}
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
					maskImage:
						"linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
				}}
			/>
			<div
				className="pointer-events-none absolute -top-40 right-[-200px] size-[600px] rounded-full"
				aria-hidden
				style={{
					background:
						"radial-gradient(closest-side, rgb(213 248 74 / 0.10), transparent 70%)",
				}}
			/>
			<div
				className="pointer-events-none absolute bottom-[-200px] left-[-200px] size-[500px] rounded-full"
				aria-hidden
				style={{
					background:
						"radial-gradient(closest-side, rgb(124 92 255 / 0.10), transparent 70%)",
				}}
			/>

			<div className="relative grid min-h-screen lg:grid-cols-2">
				{/* LEFT — brand + value props */}
				<aside className="flex flex-col justify-between px-6 py-10 sm:px-12 lg:px-16">
					<div>
						{/* Brand mark */}
						<div className="mb-12 flex items-center gap-2">
							<span
								className="size-7 rounded-md bg-gradient-to-br from-accent-500 to-lavender"
								aria-hidden
							/>
							<span className="text-h2 font-bold tracking-wider text-text-primary">
								PROVINTELL
							</span>
						</div>

						{/* Headline */}
						<h1 className="text-display max-w-xl leading-tight text-text-primary">
							Your HR system, built for your office.
						</h1>
						<p className="mt-3 flex items-center gap-2 text-body text-text-secondary">
							<CheckCircle2 className="size-4 text-cta" aria-hidden />
							<span>
								Set up in under five minutes — no procurement required.
							</span>
						</p>

						{/* Features */}
						<ul className="mt-12 max-w-md space-y-9">
							<li>
								<div
									className="mb-3 grid size-9 place-items-center rounded-lg bg-cta/15 text-cta"
									aria-hidden
								>
									<Users className="size-5" />
								</div>
								<h2 className="text-h2 text-text-primary">
									Trust-based attendance
								</h2>
								<p className="mt-1 text-body text-text-secondary">
									Clock in and out from anywhere with a single tap. No biometric
									kiosks, no fingerprint readers — just your laptop or phone.
								</p>
							</li>

							<li>
								<div
									className="mb-3 grid size-9 place-items-center rounded-lg bg-cta/15 text-cta"
									aria-hidden
								>
									<ShieldCheck className="size-5" />
								</div>
								<h2 className="text-h2 text-text-primary">
									Privacy by default
								</h2>
								<p className="mt-1 text-body text-text-secondary">
									IC numbers, bank accounts, EPF and SOCSO never leave the
									database in plaintext. Field-level encryption is on for every
									record.
								</p>
							</li>

							<li>
								<div
									className="mb-3 grid size-9 place-items-center rounded-lg bg-cta/15 text-cta"
									aria-hidden
								>
									<Lock className="size-5" />
								</div>
								<h2 className="text-h2 text-text-primary">
									Audit-grade payroll
								</h2>
								<p className="mt-1 text-body text-text-secondary">
									Every payroll change is logged in a tamper-evident chain you
									can verify in one command. No more spreadsheet
									finger-pointing.
								</p>
							</li>
						</ul>
					</div>

					{/* Footer */}
					<footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-text-tertiary">
						<span>© Provintell {new Date().getFullYear()}</span>
					</footer>
				</aside>

				{/* RIGHT — glass form card */}
				<section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:px-16">
					<div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface/60 p-8 shadow-modal backdrop-blur-sm">
						<LoginForm />
					</div>
				</section>
			</div>
		</main>
	);
}
