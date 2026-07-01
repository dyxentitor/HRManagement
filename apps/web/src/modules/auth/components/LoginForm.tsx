import { ArrowRight, Check, Eye, EyeOff, Headset, KeyRound, Lock, Mail } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const inputClass =
	"w-full rounded-lg border border-border-subtle bg-canvas py-2.5 pl-10 pr-3 text-body text-text-primary placeholder:text-text-tertiary transition-colors duration-fast focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30";

function FieldIcon({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
			aria-hidden
		>
			{children}
		</span>
	);
}

export function LoginForm() {
	const { login, loginWithMFA } = useAuth();
	const navigate = useNavigate();
	const emailId = useId();
	const pwId = useId();
	const mfaId = useId();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [remember, setRemember] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [mfaState, setMfaState] = useState<{ token: string } | null>(null);
	const [mfaCode, setMfaCode] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			if (mfaState) {
				await loginWithMFA(mfaState.token, mfaCode);
				navigate("/");
				return;
			}
			const result = await login(email, password);
			if (result.mfaRequired && result.mfaToken) {
				setMfaState({ token: result.mfaToken });
			} else {
				navigate("/");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit} noValidate>
			<header className="mb-6">
				<h1 className="text-[30px] font-bold leading-tight tracking-tight text-text-primary">
					{mfaState ? "Two-step verification" : "Welcome back 👋"}
				</h1>
				<p className="mt-1 text-body text-text-secondary">
					{mfaState
						? "Enter the 6-digit code from your authenticator app to continue."
						: "Sign in to your Provintell HRMS account."}
				</p>
			</header>

			{!mfaState ? (
				<div className="space-y-4">
					<div>
						<label htmlFor={emailId} className="mb-1.5 block text-small text-text-secondary">
							Email address
						</label>
						<div className="relative">
							<FieldIcon>
								<Mail className="size-4" />
							</FieldIcon>
							<input
								id={emailId}
								type="email"
								placeholder="you@provintell.local"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoComplete="email"
								aria-label="Email"
								className={inputClass}
							/>
						</div>
					</div>

					<div>
						<div className="mb-1.5 flex items-baseline justify-between">
							<label htmlFor={pwId} className="block text-small text-text-secondary">
								Password
							</label>
							<Link
								to="/forgot-password"
								className="text-small text-accent-200 transition-colors hover:text-accent-50"
							>
								Forgot password?
							</Link>
						</div>
						<div className="relative">
							<FieldIcon>
								<Lock className="size-4" />
							</FieldIcon>
							<input
								id={pwId}
								type={showPassword ? "text" : "password"}
								placeholder="Enter your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoComplete="current-password"
								aria-label="Password"
								className={cn(inputClass, "pr-10")}
							/>
							<button
								type="button"
								onClick={() => setShowPassword((v) => !v)}
								className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-text-tertiary hover:text-text-secondary"
								aria-label={showPassword ? "Hide password" : "Show password"}
							>
								{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</button>
						</div>
					</div>

					{/* Remember me + SSO */}
					<div className="flex items-center justify-between pt-0.5">
						<label className="flex cursor-pointer select-none items-center gap-2">
							<span className="relative grid place-items-center">
								<input
									type="checkbox"
									checked={remember}
									onChange={(e) => setRemember(e.target.checked)}
									className="peer sr-only"
								/>
								<span className="size-[18px] rounded-[6px] border border-border-strong bg-canvas transition-colors peer-checked:border-cta peer-checked:bg-cta peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/40" />
								<Check
									className="pointer-events-none absolute size-3 text-cta-foreground opacity-0 peer-checked:opacity-100"
									strokeWidth={3}
								/>
							</span>
							<span className="text-small text-text-secondary">Remember me</span>
						</label>
						<button
							type="button"
							title="Single sign-on"
							onClick={() => navigate("/forgot-password")}
							className="inline-flex items-center gap-1 text-small text-accent-200 transition-colors hover:text-accent-50"
						>
							SSO Login <ArrowRight className="size-3.5" aria-hidden />
						</button>
					</div>
				</div>
			) : (
				<div>
					<label htmlFor={mfaId} className="mb-1.5 block text-small text-text-secondary">
						Authenticator code
					</label>
					<div className="relative">
						<FieldIcon>
							<KeyRound className="size-4" />
						</FieldIcon>
						<input
							id={mfaId}
							type="text"
							placeholder="6-digit code"
							value={mfaCode}
							onChange={(e) => setMfaCode(e.target.value)}
							required
							inputMode="numeric"
							maxLength={6}
							aria-label="MFA code"
							// biome-ignore lint/a11y/noAutofocus: MFA step auto-focuses the code field intentionally
							autoFocus
							className={cn(inputClass, "font-mono tracking-[0.3em]")}
						/>
					</div>
				</div>
			)}

			{error && (
				<p
					role="alert"
					className="mt-4 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-small text-coral"
				>
					{error}
				</p>
			)}

			<button
				type="submit"
				disabled={submitting}
				className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-cta py-3 text-h3 font-bold text-cta-foreground shadow-[0_10px_30px_-10px_rgb(213_248_74_/_0.55)] transition-colors duration-fast hover:bg-cta/90 disabled:opacity-60"
			>
				{submitting ? (
					mfaState ? (
						"Verifying…"
					) : (
						"Signing in…"
					)
				) : (
					<>
						{mfaState ? "Verify code" : "Sign in"}
						<ArrowRight className="size-4" aria-hidden />
					</>
				)}
			</button>

			<div className="mt-5 text-center">
				<a
					href="mailto:support@provintell.local"
					className="text-small text-text-tertiary transition-colors hover:text-text-secondary"
				>
					Need help?
				</a>
			</div>

			{/* Contact card */}
			<div className="mt-6 flex items-center gap-3 rounded-xl border border-border-subtle bg-canvas/50 px-4 py-3">
				<span
					className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-500/15 text-accent-200"
					aria-hidden
				>
					<Headset className="size-4" />
				</span>
				<div className="min-w-0">
					<p className="text-small font-semibold text-text-secondary">
						Contact your HR administrator
					</p>
					<p className="truncate text-small text-text-tertiary">
						support@provintell.local · +60 3-1234 5678
					</p>
				</div>
			</div>
		</form>
	);
}
