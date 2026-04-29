import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/lib/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function ResetPasswordPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token") ?? "";

	const pw1Id = useId();
	const pw2Id = useId();

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Already signed in — go home
	if (user) return <Navigate to="/" replace />;

	// No token in URL — redirect to forgot-password
	if (!token) return <Navigate to="/forgot-password" replace />;

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}
		if (password !== confirm) {
			setError("Passwords do not match");
			return;
		}

		setSubmitting(true);
		try {
			const resp = await fetch(`${BASE_URL}/api/v1/auth/password/reset`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, new_password: password }),
			});
			if (!resp.ok) {
				const body = (await resp.json().catch(() => ({}))) as {
					detail?: string;
				};
				throw new Error(
					body.detail ?? "Reset failed — the link may have expired",
				);
			}
			// Success — redirect to login with a toast hint via query param
			navigate("/login?reset=1", { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSubmitting(false);
		}
	}

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
					maskImage:
						"linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
				}}
			/>
			<div className="relative flex min-h-screen items-center justify-center px-6">
				<div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface/60 p-8 shadow-modal backdrop-blur-sm">
					<form onSubmit={onSubmit} noValidate>
						<header className="mb-6">
							<h1 className="text-h1 text-text-primary">
								Choose a new password
							</h1>
							<p className="mt-1 text-body text-text-secondary">
								At least 8 characters. You'll be redirected to sign in.
							</p>
						</header>

						<div className="space-y-4">
							<div>
								<label
									htmlFor={pw1Id}
									className="mb-1 block text-small text-text-tertiary"
								>
									New password
								</label>
								<div className="relative">
									<input
										id={pw1Id}
										type={showPassword ? "text" : "password"}
										placeholder="At least 8 characters"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										required
										minLength={8}
										autoComplete="new-password"
										className="w-full rounded-md border border-border-subtle bg-canvas py-2.5 pl-3 pr-10 text-body text-text-primary placeholder:text-text-tertiary transition-colors duration-fast focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
									/>
									<button
										type="button"
										onClick={() => setShowPassword((v) => !v)}
										className="absolute right-2 top-1/2 grid -translate-y-1/2 size-7 place-items-center rounded text-text-tertiary hover:text-text-secondary"
										aria-label={
											showPassword ? "Hide password" : "Show password"
										}
									>
										{showPassword ? (
											<EyeOff className="size-4" />
										) : (
											<Eye className="size-4" />
										)}
									</button>
								</div>
							</div>

							<div>
								<label
									htmlFor={pw2Id}
									className="mb-1 block text-small text-text-tertiary"
								>
									Confirm password
								</label>
								<input
									id={pw2Id}
									type={showPassword ? "text" : "password"}
									placeholder="Repeat password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
									required
									autoComplete="new-password"
									className="w-full rounded-md border border-border-subtle bg-canvas py-2.5 px-3 text-body text-text-primary placeholder:text-text-tertiary transition-colors duration-fast focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
								/>
							</div>
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
							{submitting ? "Updating…" : "Update password"}
						</button>
					</form>
				</div>
			</div>
		</main>
	);
}
