import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { tokenStorage } from "@/lib/token-storage";
import { cn } from "@/lib/utils";

import { verifyInvitation } from "@/modules/auth/activation-api";
import { onboardingApi } from "./onboarding-api";
import { PreferencesStep } from "./steps/PreferencesStep";
import { ProfileStep } from "./steps/ProfileStep";
import { ReadyStep } from "./steps/ReadyStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SecurityStep } from "./steps/SecurityStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import type { InvitationPreview, StepCtx, StepKey } from "./steps/types";

const ORDER: StepKey[] = ["welcome", "security", "profile", "preferences", "review", "ready"];
const RAIL: { key: StepKey; label: string; hint?: string }[] = [
	{ key: "welcome", label: "Welcome" },
	{ key: "security", label: "Security", hint: "password + MFA" },
	{ key: "profile", label: "Your profile", hint: "contact · emergency" },
	{ key: "preferences", label: "Preferences" },
	{ key: "review", label: "Review" },
];

export function OnboardingWizard({ mode }: { mode: "activate" | "resume" }) {
	const [params] = useSearchParams();
	const token = params.get("token") ?? "";
	const navigate = useNavigate();
	const { user, loading } = useAuth();

	const [step, setStep] = useState<StepKey>(mode === "activate" ? "welcome" : "profile");
	const [preview, setPreview] = useState<InvitationPreview | null>(null);
	const [invalid, setInvalid] = useState(false);
	const [saved, setSaved] = useState(false);

	// activate mode: verify the token for the welcome preview
	useEffect(() => {
		if (mode !== "activate") return;
		if (!token) {
			setInvalid(true);
			return;
		}
		verifyInvitation(token)
			.then(setPreview)
			.catch(() => setInvalid(true));
	}, [mode, token]);

	// resume mode: must be authenticated; jump to the saved step
	useEffect(() => {
		if (mode !== "resume" || loading) return;
		if (!tokenStorage.getAccess()) {
			navigate("/login", { replace: true });
			return;
		}
		const ob = (user?.preferences?.onboarding ?? {}) as { step?: string; completed?: boolean };
		if (ob.completed) {
			navigate("/", { replace: true });
			return;
		}
		const s = ob.step as StepKey | undefined;
		if (s && ORDER.includes(s)) setStep(s);
	}, [mode, loading, user, navigate]);

	const markSaved = useCallback(() => {
		setSaved(true);
		window.setTimeout(() => setSaved(false), 4000);
	}, []);

	const goTo = useCallback((s: StepKey) => setStep(s), []);

	const goNext = useCallback(() => {
		const i = ORDER.indexOf(step);
		const next = ORDER[Math.min(i + 1, ORDER.length - 1)];
		// persist progress for post-auth steps so the journey can resume
		if (["profile", "preferences", "review"].includes(next)) {
			void onboardingApi.setStep(next).catch(() => undefined);
		}
		setStep(next);
	}, [step]);

	const goBack = useCallback(() => {
		const i = ORDER.indexOf(step);
		const min = mode === "resume" ? ORDER.indexOf("profile") : 0;
		setStep(ORDER[Math.max(i - 1, min)]);
	}, [step, mode]);

	const finish = useCallback(() => {
		void onboardingApi.complete().finally(() => navigate("/", { replace: true }));
	}, [navigate]);

	const ctx: StepCtx = useMemo(
		() => ({ mode, token, preview, goNext, goBack, goTo, finish, markSaved }),
		[mode, token, preview, goNext, goBack, goTo, finish, markSaved],
	);

	const railIndex = Math.min(
		RAIL.findIndex((r) => r.key === step),
		RAIL.length - 1,
	);
	const progress = step === "ready" ? 100 : Math.round((railIndex / RAIL.length) * 100);
	const firstName = preview?.full_name?.split(" ")[0] ?? "there";

	if (invalid) {
		return (
			<Shell>
				<div className="flex flex-col items-center justify-center h-full text-center">
					<h2 className="text-h1 text-text-primary">Invitation unavailable</h2>
					<p className="text-body text-text-secondary mt-2 max-w-sm">
						This link is invalid, already used, or expired. Please ask your HR team to send a fresh
						invitation.
					</p>
					<button
						type="button"
						className="mt-6 text-accent-200 hover:underline"
						onClick={() => navigate("/login")}
					>
						Go to sign in
					</button>
				</div>
			</Shell>
		);
	}

	return (
		<Shell>
			<div className="grid lg:grid-cols-[240px_1fr] h-full">
				{/* Rail */}
				<aside className="hidden lg:flex flex-col border-r border-border-subtle p-6">
					<p className="layer-eyebrow text-accent-200">
						{preview?.org_name ?? "Provintell"} · Onboarding
					</p>
					<p className="text-h3 text-text-primary mt-1">Welcome, {firstName}</p>
					<p className="text-[11px] text-text-tertiary">~3 min to finish</p>
					<div className="my-5">
						<div className="h-1 rounded-full bg-surface-elevated/60 overflow-hidden">
							<div
								className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-200 transition-all"
								style={{ width: `${progress}%` }}
							/>
						</div>
						<p className="text-[10px] text-text-tertiary mt-1.5">{progress}% complete</p>
					</div>
					<nav className="flex-1 space-y-0.5">
						{RAIL.map((r, i) => {
							const done = i < railIndex || step === "ready";
							const active = r.key === step;
							return (
								<div key={r.key} className="flex items-center gap-2.5 py-1.5">
									<span
										className={cn(
											"size-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0",
											done
												? "bg-mint text-canvas"
												: active
													? "bg-accent-500 text-white"
													: "bg-surface-elevated/60 text-text-tertiary",
										)}
									>
										{done ? <Check className="size-3.5" /> : i + 1}
									</span>
									<div>
										<p
											className={cn(
												"text-small",
												active ? "text-text-primary" : "text-text-secondary",
											)}
										>
											{r.label}
										</p>
										{r.hint && active && <p className="text-[9px] text-text-tertiary">{r.hint}</p>}
									</div>
								</div>
							);
						})}
					</nav>
					{saved && (
						<p className="text-[10px] text-text-tertiary flex items-center gap-1.5">
							<span className="size-1.5 rounded-full bg-mint" /> Draft saved · just now
						</p>
					)}
				</aside>

				{/* Mobile progress */}
				<div className="lg:hidden h-1 bg-surface-elevated/60">
					<div className="h-full bg-accent-500" style={{ width: `${progress}%` }} />
				</div>

				{/* Content */}
				<div className="p-7 sm:p-10 overflow-y-auto flex flex-col">
					{step === "welcome" && <WelcomeStep ctx={ctx} />}
					{step === "security" && <SecurityStep ctx={ctx} />}
					{step === "profile" && <ProfileStep ctx={ctx} />}
					{step === "preferences" && <PreferencesStep ctx={ctx} />}
					{step === "review" && <ReviewStep ctx={ctx} />}
					{step === "ready" && <ReadyStep ctx={ctx} />}
				</div>
			</div>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative min-h-screen bg-canvas">
			<div
				className="pointer-events-none absolute inset-0"
				aria-hidden
				style={{
					background:
						"radial-gradient(600px 300px at 0% 0%, rgb(124 92 255 / 0.18), transparent 60%), radial-gradient(500px 300px at 100% 100%, rgb(151 217 199 / 0.08), transparent 60%)",
				}}
			/>
			<div className="relative min-h-screen lg:p-6">
				<div className="glass-surface lg:rounded-2xl overflow-hidden min-h-screen lg:min-h-[calc(100vh-3rem)]">
					{children}
				</div>
			</div>
		</div>
	);
}
