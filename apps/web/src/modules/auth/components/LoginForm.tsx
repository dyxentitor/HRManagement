import { Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const inputClass =
	"w-full rounded-md border border-border-subtle bg-canvas py-2.5 pl-10 pr-3 text-body text-text-primary placeholder:text-text-tertiary transition-colors duration-fast focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30";

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
				<h1 className="text-h1 text-text-primary">
					{mfaState ? "Two-step verification" : "Welcome back"}
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
						<label
							htmlFor={emailId}
							className="mb-1 block text-small text-text-tertiary"
						>
							Email
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
						<div className="mb-1 flex items-baseline justify-between">
							<label
								htmlFor={pwId}
								className="block text-small text-text-tertiary"
							>
								Password
							</label>
							<a
								href="/forgot-password"
								className="text-small text-accent-200 hover:text-accent-50"
							>
								Forgot?
							</a>
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
								className="absolute right-2 top-1/2 grid -translate-y-1/2 size-7 place-items-center rounded text-text-tertiary hover:text-text-secondary"
								aria-label={showPassword ? "Hide password" : "Show password"}
							>
								{showPassword ? (
									<EyeOff className="size-4" />
								) : (
									<Eye className="size-4" />
								)}
							</button>
						</div>
					</div>
				</div>
			) : (
				<div>
					<label
						htmlFor={mfaId}
						className="mb-1 block text-small text-text-tertiary"
					>
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
							className={cn(inputClass, "tracking-[0.3em] font-mono")}
						/>
					</div>
				</div>
			)}

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
				{submitting ? "…" : mfaState ? "Verify code" : "Sign in"}
			</button>

			<p className="mt-6 text-center text-small text-text-tertiary">
				Need an account? Ask your HR admin.
			</p>
		</form>
	);
}
