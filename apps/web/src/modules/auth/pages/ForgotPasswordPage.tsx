import { CheckCircle2 } from "lucide-react";
import { useId, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function ForgotPasswordPage() {
	const { user } = useAuth();
	const emailId = useId();
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Already signed in — go home
	if (user) return <Navigate to="/" replace />;

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const resp = await fetch(`${BASE_URL}/api/v1/auth/password/forgot`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			if (!resp.ok) {
				throw new Error("Request failed — please try again");
			}
			setSubmitted(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-canvas text-text-primary">
			{/* Atmospheric background (matches LoginPage) */}
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
			<div className="relative flex min-h-screen items-center justify-center px-6">
				<div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface/60 p-8 shadow-modal backdrop-blur-sm">
					{submitted ? (
						<div className="text-center">
							<CheckCircle2 className="mx-auto size-12 text-mint mb-4" />
							<h1 className="text-h1 text-text-primary mb-2">
								Check your inbox
							</h1>
							<p className="text-body text-text-secondary">
								If an account with that email exists, we sent a password reset
								link. It may take a minute to arrive.
							</p>
							<a
								href="/login"
								className="mt-6 inline-block text-small text-accent-200 hover:text-accent-50"
							>
								Back to sign in
							</a>
						</div>
					) : (
						<form onSubmit={onSubmit} noValidate>
							<header className="mb-6">
								<h1 className="text-h1 text-text-primary">
									Reset your password
								</h1>
								<p className="mt-1 text-body text-text-secondary">
									Enter your email and we'll send you a reset link.
								</p>
							</header>

							<div>
								<label
									htmlFor={emailId}
									className="mb-1 block text-small text-text-tertiary"
								>
									Email address
								</label>
								<input
									id={emailId}
									type="email"
									placeholder="you@provintell.local"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									autoComplete="email"
									className="w-full rounded-md border border-border-subtle bg-canvas py-2.5 px-3 text-body text-text-primary placeholder:text-text-tertiary transition-colors duration-fast focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
								/>
							</div>

							{error && (
								<p
									role="alert"
									className="mt-4 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-small text-coral"
								>
									{error}
								</p>
							)}

							<button
								type="submit"
								disabled={submitting}
								className="mt-6 w-full rounded-md bg-cta py-3 text-h3 font-bold text-cta-foreground transition-colors duration-fast hover:bg-cta/90 disabled:opacity-60"
							>
								{submitting ? "Sending…" : "Send reset link"}
							</button>

							<p className="mt-4 text-center text-small text-text-tertiary">
								<a
									href="/login"
									className="text-accent-200 hover:text-accent-50"
								>
									Back to sign in
								</a>
							</p>
						</form>
					)}
				</div>
			</div>
		</main>
	);
}
