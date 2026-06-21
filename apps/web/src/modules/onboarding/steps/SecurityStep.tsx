import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { tokenStorage } from "@/lib/token-storage";

import { activateInvitation } from "@/modules/auth/activation-api";
import { onboardingApi } from "../onboarding-api";
import { StepFooter, StepHeader } from "./chrome";
import type { StepCtx } from "./types";

function strength(pw: string): { idx: number; label: string; tone: string } {
	let s = 0;
	if (pw.length >= 8) s += 1;
	if (pw.length >= 12) s += 1;
	if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
	if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;
	const idx = Math.min(s, 4) - 1;
	const labels = ["Weak", "Fair", "Strong", "Excellent"];
	const tones = ["bg-coral", "bg-yellow", "bg-sky", "bg-mint"];
	return { idx, label: labels[Math.max(0, idx)], tone: tones[Math.max(0, idx)] };
}

export function SecurityStep({ ctx }: { ctx: StepCtx }) {
	const { refreshMe } = useAuth();
	const [phase, setPhase] = useState<"password" | "mfa">("password");

	// password
	const [pw, setPw] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const st = strength(pw);

	// mfa
	const [qr, setQr] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const [mfaConfirmed, setMfaConfirmed] = useState(false);

	async function submitPassword() {
		setError(null);
		if (pw.length < 8) return setError("Password must be at least 8 characters.");
		if (pw !== confirm) return setError("Passwords do not match.");
		setBusy(true);
		try {
			const tokens = await activateInvitation(ctx.token, pw);
			tokenStorage.set(tokens.access_token, tokens.refresh_token);
			await refreshMe();
			ctx.markSaved();
			setPhase("mfa");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Activation failed.");
		} finally {
			setBusy(false);
		}
	}

	async function startMfa() {
		setError(null);
		try {
			setQr((await onboardingApi.mfaEnable()).qr_code);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not start MFA setup.");
		}
	}

	async function confirmMfa() {
		setError(null);
		setBusy(true);
		try {
			await onboardingApi.mfaConfirm(code.trim());
			setMfaConfirmed(true);
			await refreshMe();
			setTimeout(ctx.goNext, 600);
		} catch (e) {
			setError(e instanceof Error ? e.message : "That code didn't match.");
		} finally {
			setBusy(false);
		}
	}

	if (phase === "password") {
		return (
			<div className="flex flex-col h-full">
				<StepHeader
					n="Step 2"
					title="Secure your account"
					subtitle="Create a password only you know — HR never sees it."
				/>
				<div className="space-y-4 max-w-sm">
					<div>
						<label className="text-label uppercase text-text-tertiary" htmlFor="ob-pw">
							Create password
						</label>
						<Input
							id="ob-pw"
							type="password"
							value={pw}
							onChange={(e) => setPw(e.target.value)}
							placeholder="At least 8 characters"
							autoComplete="new-password"
						/>
						{pw && (
							<div className="mt-2 flex items-center gap-2">
								<div className="flex-1 flex gap-1">
									{[0, 1, 2, 3].map((i) => (
										<span
											key={i}
											className={`h-1 flex-1 rounded-full ${i <= st.idx ? st.tone : "bg-border-subtle"}`}
										/>
									))}
								</div>
								<span className="text-[11px] text-text-tertiary">{st.label}</span>
							</div>
						)}
					</div>
					<div>
						<label className="text-label uppercase text-text-tertiary" htmlFor="ob-pw2">
							Confirm password
						</label>
						<Input
							id="ob-pw2"
							type="password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							autoComplete="new-password"
						/>
					</div>
					{error && <p className="text-small text-coral">{error}</p>}
				</div>
				<StepFooter
					onBack={ctx.goBack}
					primaryLabel={busy ? "Securing…" : "Set password & continue →"}
					onPrimary={submitPassword}
					primaryDisabled={busy}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<StepHeader
				n="Step 2 · Two-factor"
				title="Add an extra layer of security"
				subtitle="Strongly recommended. Scan the code with an authenticator app (Google Authenticator, 1Password…)."
			/>
			{mfaConfirmed ? (
				<p className="text-mint flex items-center gap-2">
					<CheckCircle2 className="size-5" /> Two-factor authentication enabled.
				</p>
			) : qr ? (
				<div className="flex items-start gap-5">
					{/* biome-ignore lint/a11y/useAltText: decorative TOTP QR */}
					<img src={qr} alt="MFA QR code" className="size-36 rounded-lg bg-white p-1" />
					<div className="space-y-3 max-w-xs">
						<p className="text-small text-text-secondary">
							Scan, then enter the 6-digit code to confirm.
						</p>
						<Input
							value={code}
							onChange={(e) => setCode(e.target.value)}
							placeholder="123456"
							inputMode="numeric"
							maxLength={6}
						/>
						{error && <p className="text-small text-coral">{error}</p>}
						<Button onClick={confirmMfa} disabled={busy || code.length < 6}>
							{busy ? "Confirming…" : "Confirm code"}
						</Button>
					</div>
				</div>
			) : (
				<Button variant="outline" onClick={startMfa} className="self-start">
					<ShieldCheck className="size-4 mr-2" /> Set up two-factor authentication
				</Button>
			)}
			<StepFooter
				primaryLabel="Continue →"
				onPrimary={ctx.goNext}
				secondaryLabel={mfaConfirmed ? undefined : "Skip for now"}
				onSecondary={ctx.goNext}
			/>
		</div>
	);
}
