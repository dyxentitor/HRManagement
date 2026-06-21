import { CheckCircle2, Eye, EyeOff, PartyPopper } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { type InvitationPreview, activateInvitation, verifyInvitation } from "../activation-api";

type Phase = "checking" | "invalid" | "form" | "done";

function CardShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative min-h-screen bg-canvas">
			<div
				className="pointer-events-none absolute inset-0"
				aria-hidden
				style={{
					backgroundImage:
						"linear-gradient(to right, rgb(255 255 255 / 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.045) 1px, transparent 1px)",
					backgroundSize: "80px 80px",
					backgroundPosition: "center -100px",
					maskImage: "linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
					WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 30%, transparent 70%)",
				}}
			/>
			<div className="relative flex min-h-screen items-center justify-center px-6">
				<div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface/60 p-8 shadow-modal backdrop-blur-sm">
					{children}
				</div>
			</div>
		</div>
	);
}

export default function ActivatePage() {
	const [params] = useSearchParams();
	const token = params.get("token") ?? "";
	const navigate = useNavigate();
	const pw1Id = useId();
	const pw2Id = useId();

	const [phase, setPhase] = useState<Phase>("checking");
	const [preview, setPreview] = useState<InvitationPreview | null>(null);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [show, setShow] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!token) {
			setPhase("invalid");
			return;
		}
		(async () => {
			try {
				const p = await verifyInvitation(token);
				if (!cancelled) {
					setPreview(p);
					setPhase("form");
				}
			} catch {
				if (!cancelled) setPhase("invalid");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token]);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Passwords do not match.");
			return;
		}
		setSubmitting(true);
		try {
			await activateInvitation(token, password);
			setPhase("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Activation failed.");
		} finally {
			setSubmitting(false);
		}
	}

	if (phase === "checking") {
		return (
			<CardShell>
				<p className="text-body text-text-secondary">Checking your invitation…</p>
			</CardShell>
		);
	}

	if (phase === "invalid") {
		return (
			<CardShell>
				<h1 className="text-h1 text-text-primary">Invitation unavailable</h1>
				<p className="mt-2 text-body text-text-secondary">
					This invitation link is invalid, has already been used, or has expired. Please ask your HR
					team to send a fresh invitation.
				</p>
				<Button className="mt-6 w-full" onClick={() => navigate("/login")}>
					Go to sign in
				</Button>
			</CardShell>
		);
	}

	if (phase === "done") {
		return (
			<CardShell>
				<div className="text-center">
					<PartyPopper className="size-9 text-accent-300 mx-auto" />
					<h1 className="text-h1 text-text-primary mt-3">Welcome aboard! 🎉</h1>
					<p className="mt-2 text-body text-text-secondary">
						Your account is ready. Sign in to view your dashboard, submit leave, and finish your
						onboarding.
					</p>
					<Button className="mt-6 w-full soft-glow" onClick={() => navigate("/login")}>
						Go to sign in
					</Button>
				</div>
			</CardShell>
		);
	}

	return (
		<CardShell>
			<form onSubmit={onSubmit} noValidate>
				<header className="mb-6">
					<p className="layer-eyebrow text-accent-200">Welcome to {preview?.org_name}</p>
					<h1 className="text-h1 text-text-primary mt-1">Hi {preview?.full_name} 👋</h1>
					<p className="mt-1 text-body text-text-secondary">
						Let's secure your account — choose a password to activate{" "}
						<span className="text-text-primary">{preview?.email}</span>. Takes about a minute.
					</p>
				</header>

				<div className="space-y-4">
					<div>
						<label htmlFor={pw1Id} className="mb-1 block text-small text-text-tertiary">
							Create password
						</label>
						<div className="relative">
							<input
								id={pw1Id}
								type={show ? "text" : "password"}
								placeholder="At least 8 characters"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
								autoComplete="new-password"
								className="w-full rounded-md border border-border-subtle bg-canvas py-2.5 pl-3 pr-10 text-body text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
							/>
							<button
								type="button"
								onClick={() => setShow((v) => !v)}
								className="absolute right-2 top-1/2 grid -translate-y-1/2 size-7 place-items-center rounded text-text-tertiary hover:text-text-secondary"
								aria-label={show ? "Hide password" : "Show password"}
							>
								{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</button>
						</div>
						<PasswordStrength value={password} />
					</div>

					<div>
						<label htmlFor={pw2Id} className="mb-1 block text-small text-text-tertiary">
							Confirm password
						</label>
						<input
							id={pw2Id}
							type={show ? "text" : "password"}
							placeholder="Re-enter password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							required
							autoComplete="new-password"
							className="w-full rounded-md border border-border-subtle bg-canvas py-2.5 px-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
						/>
					</div>

					{error && (
						<p role="alert" className="text-small text-coral">
							{error}
						</p>
					)}

					<Button type="submit" disabled={submitting} className="w-full soft-glow">
						{submitting ? "Activating…" : "Activate my account"}
					</Button>
				</div>
			</form>
		</CardShell>
	);
}

const LEVELS = [
	{ label: "Weak", tone: "bg-coral text-coral" },
	{ label: "Fair", tone: "bg-yellow text-yellow" },
	{ label: "Strong", tone: "bg-sky text-sky" },
	{ label: "Excellent", tone: "bg-mint text-mint" },
];

function scorePassword(pw: string): number {
	if (!pw) return -1;
	let s = 0;
	if (pw.length >= 8) s += 1;
	if (pw.length >= 12) s += 1;
	if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
	if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;
	return Math.min(s, 4) - 1;
}

function PasswordStrength({ value }: { value: string }) {
	const idx = scorePassword(value);
	if (idx < 0) return null;
	const level = LEVELS[idx];
	return (
		<div className="mt-2 flex items-center gap-2" aria-live="polite">
			<div className="flex-1 flex gap-1">
				{LEVELS.map((l, i) => (
					<span
						key={l.label}
						className={`h-1 flex-1 rounded-full ${i <= idx ? level.tone.split(" ")[0] : "bg-border-subtle"}`}
					/>
				))}
			</div>
			<span className={`text-[11px] flex items-center gap-1 ${level.tone.split(" ")[1]}`}>
				{idx === 3 && <CheckCircle2 className="size-3" />}
				{level.label}
			</span>
		</div>
	);
}
