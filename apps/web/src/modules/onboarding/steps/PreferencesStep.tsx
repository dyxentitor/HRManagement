import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";

import { onboardingApi } from "../onboarding-api";
import { StepFooter, StepHeader } from "./chrome";
import type { StepCtx } from "./types";

const THEMES = ["system", "dark", "light"];
const LOCALES = [
	{ value: "en-MY", label: "English (Malaysia)" },
	{ value: "ms-MY", label: "Bahasa Melayu" },
];

function Select({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-label uppercase text-text-tertiary">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="text-small px-2.5 py-2 bg-surface-elevated/40 border border-border-subtle rounded-lg"
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

export function PreferencesStep({ ctx }: { ctx: StepCtx }) {
	const { user } = useAuth();
	const p = (user?.preferences ?? {}) as Record<string, unknown>;
	const notif = (p.notifications ?? {}) as { email?: boolean; digest?: boolean };

	const [theme, setTheme] = useState(String(p.theme ?? "system"));
	const [locale, setLocale] = useState(String(p.locale ?? "en-MY"));
	const [timezone, setTimezone] = useState(String(p.timezone ?? "Asia/Kuala_Lumpur"));
	const [email, setEmail] = useState(notif.email ?? true);
	const [digest, setDigest] = useState(notif.digest ?? true);
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			await onboardingApi.updatePreferences({
				theme,
				locale,
				timezone,
				notifications: { email, digest },
			});
			ctx.markSaved();
			ctx.goNext();
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col h-full">
			<StepHeader
				n="Step 4"
				title="Make it yours"
				subtitle="A few preferences so the app feels right from your first login."
			/>
			<div className="grid sm:grid-cols-2 gap-4 max-w-lg">
				<Select label="Language" value={locale} onChange={setLocale} options={LOCALES} />
				<Select
					label="Theme"
					value={theme}
					onChange={setTheme}
					options={THEMES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
				/>
				<Select
					label="Time zone"
					value={timezone}
					onChange={setTimezone}
					options={[
						{ value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
						{ value: "Asia/Singapore", label: "Singapore (GMT+8)" },
					]}
				/>
			</div>
			<div className="mt-5 space-y-3 max-w-lg">
				<Toggle
					label="Email notifications"
					hint="Approvals, payslips, and important updates."
					checked={email}
					onChange={setEmail}
				/>
				<Toggle
					label="Weekly digest"
					hint="A Monday summary of what needs your attention."
					checked={digest}
					onChange={setDigest}
				/>
			</div>
			<StepFooter
				onBack={ctx.goBack}
				primaryLabel={busy ? "Saving…" : "Save & continue →"}
				onPrimary={save}
				primaryDisabled={busy}
			/>
		</div>
	);
}

function Toggle({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4 glass-surface rounded-xl px-4 py-3">
			<div>
				<p className="text-small text-text-primary">{label}</p>
				<p className="text-[11px] text-text-tertiary">{hint}</p>
			</div>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	);
}
