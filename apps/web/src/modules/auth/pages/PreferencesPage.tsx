import { useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/lib/authed-fetch";
import { useAuth } from "@/lib/auth";

import {
	type NotificationPreference,
	getPreferences,
	updatePreferences,
} from "../../notifications/api";
import {
	eventDomain,
	getDomainLabel,
	getEventLabel,
} from "../../notifications/event-labels";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const SECURITY_TYPES = new Set([
	"auth.login",
	"auth.password_changed",
	"auth.mfa_enabled",
	"auth.mfa_disabled",
	"employee.bank_changed_self",
	"user.role_changed",
]);

const CHANNELS: Array<"in_app" | "email"> = ["in_app", "email"];

// Shared client: token header + app-wide 401 → refresh → retry.
const authFetch = authedFetch;

// ────────────────────────────────────────────────────────────
// MFA section
// ────────────────────────────────────────────────────────────

interface MFAEnableData {
	provisioning_uri: string;
	qr_code: string;
	secret: string;
}

function MFASection() {
	const { user, refreshMe } = useAuth();
	const [modalOpen, setModalOpen] = useState(false);
	const [disableModalOpen, setDisableModalOpen] = useState(false);
	const [enableData, setEnableData] = useState<MFAEnableData | null>(null);
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const mfaEnabled = user?.mfa_enabled ?? false;

	async function handleEnableClick() {
		setBusy(true);
		setError(null);
		try {
			const resp = await authFetch(`${BASE_URL}/api/v1/auth/mfa/enable`, {
				method: "POST",
			});
			if (!resp.ok) throw new Error("Failed to start MFA setup");
			const data = (await resp.json()) as MFAEnableData;
			setEnableData(data);
			setModalOpen(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Error");
		} finally {
			setBusy(false);
		}
	}

	async function handleConfirm() {
		if (!code || code.length < 6) {
			setError("Enter the 6-digit code from your authenticator app");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const resp = await authFetch(`${BASE_URL}/api/v1/auth/mfa/confirm`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code }),
			});
			if (!resp.ok) throw new Error("Invalid code — try again");
			setModalOpen(false);
			setEnableData(null);
			setCode("");
			await refreshMe();
			toast.success("Two-step verification enabled");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Error");
		} finally {
			setBusy(false);
		}
	}

	async function handleDisable() {
		setBusy(true);
		setError(null);
		try {
			const resp = await authFetch(`${BASE_URL}/api/v1/auth/mfa`, {
				method: "DELETE",
			});
			if (!resp.ok) throw new Error("Failed to disable MFA");
			setDisableModalOpen(false);
			await refreshMe();
			toast.success("Two-step verification disabled");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section
			id="section-twostep"
			className="bg-surface-hover border border-border-subtle rounded-lg p-5"
		>
			<header className="mb-3">
				<h2 className="text-h2 text-text-primary">Two-step verification</h2>
				<p className="text-body text-text-secondary mt-1">
					Protect your account with an authenticator app.
				</p>
			</header>
			{error && (
				<p role="alert" className="text-coral text-small mb-2">
					{error}
				</p>
			)}
			{mfaEnabled ? (
				<div className="flex items-center gap-3">
					<StatusPill tone="mint" label="Enabled" />
					<button
						type="button"
						onClick={() => setDisableModalOpen(true)}
						className="text-small text-coral hover:underline"
					>
						Disable two-step verification
					</button>
				</div>
			) : (
				<div>
					<p className="text-body text-text-secondary mb-3">
						Add an extra layer of security. Use an authenticator app like Google
						Authenticator or Authy.
					</p>
					<button
						type="button"
						onClick={handleEnableClick}
						disabled={busy}
						className="px-4 py-2 bg-accent-500 text-white rounded text-sm hover:bg-accent-600 disabled:opacity-50"
					>
						{busy ? "Loading…" : "Enable two-step verification"}
					</button>
				</div>
			)}

			{/* Enable modal */}
			{modalOpen && enableData && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Set up two-step verification"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
				>
					<div className="bg-surface-elevated border border-border-subtle rounded-xl p-6 max-w-sm w-full mx-4">
						<h3 className="text-h2 text-text-primary mb-3">
							Set up two-step verification
						</h3>
						<p className="text-body text-text-secondary mb-3">
							Scan this QR code with your authenticator app, then enter the
							6-digit code to confirm.
						</p>
						{enableData.qr_code && (
							<img
								src={enableData.qr_code}
								alt="QR code for two-step verification setup"
								className="mx-auto mb-3 rounded border border-border-subtle"
								width={180}
								height={180}
							/>
						)}
						<p className="text-small text-text-tertiary font-mono break-all mb-3">
							Manual key: {enableData.secret}
						</p>
						<label className="block text-small text-text-tertiary mb-1">
							Authenticator code
						</label>
						<input
							type="text"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							inputMode="numeric"
							maxLength={6}
							placeholder="6-digit code"
							className="w-full rounded-md border border-border-subtle bg-canvas py-2 px-3 text-body text-text-primary placeholder:text-text-tertiary font-mono tracking-widest mb-3"
						/>
						{error && (
							<p role="alert" className="text-coral text-small mb-2">
								{error}
							</p>
						)}
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleConfirm}
								disabled={busy}
								className="flex-1 px-4 py-2 bg-accent-500 text-white rounded text-sm hover:bg-accent-600 disabled:opacity-50"
							>
								{busy ? "Verifying…" : "Confirm"}
							</button>
							<button
								type="button"
								onClick={() => {
									setModalOpen(false);
									setError(null);
									setCode("");
								}}
								className="px-4 py-2 border border-border-subtle rounded text-sm text-text-secondary hover:bg-surface-hover"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Disable confirmation modal */}
			{disableModalOpen && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Disable two-step verification"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
				>
					<div className="bg-surface-elevated border border-border-subtle rounded-xl p-6 max-w-sm w-full mx-4">
						<h3 className="text-h2 text-text-primary mb-3">
							Disable two-step verification?
						</h3>
						<p className="text-body text-text-secondary mb-4">
							This will remove the extra security layer from your account.
						</p>
						{error && (
							<p role="alert" className="text-coral text-small mb-2">
								{error}
							</p>
						)}
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleDisable}
								disabled={busy}
								className="flex-1 px-4 py-2 bg-coral text-white rounded text-sm hover:opacity-90 disabled:opacity-50"
							>
								{busy ? "Disabling…" : "Disable"}
							</button>
							<button
								type="button"
								onClick={() => {
									setDisableModalOpen(false);
									setError(null);
								}}
								className="px-4 py-2 border border-border-subtle rounded text-sm text-text-secondary hover:bg-surface-hover"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}

// ────────────────────────────────────────────────────────────
// Notification preferences matrix
// ────────────────────────────────────────────────────────────

function groupByDomain(
	types: string[],
): Array<{ domain: string; types: string[] }> {
	const map = new Map<string, string[]>();
	for (const t of types) {
		const d = eventDomain(t);
		if (!map.has(d)) map.set(d, []);
		map.get(d)?.push(t);
	}
	// Sort types alphabetically within domain
	return [...map.entries()].map(([domain, domTypes]) => ({
		domain,
		types: domTypes.sort(),
	}));
}

function NotificationMatrix({
	prefs,
	onToggle,
	onSave,
	saving,
	dirty,
}: {
	prefs: NotificationPreference[];
	onToggle: (type: string, channel: "in_app" | "email") => void;
	onSave: () => void;
	saving: boolean;
	dirty: boolean;
}) {
	const prefMap = new Map<string, NotificationPreference>();
	for (const p of prefs) {
		prefMap.set(`${p.type}:${p.channel}`, p);
	}

	function isEnabled(type: string, channel: "in_app" | "email"): boolean {
		return prefMap.get(`${type}:${channel}`)?.enabled ?? true;
	}

	const types = [...new Set(prefs.map((p) => p.type))].sort();
	const groups = groupByDomain(types);

	return (
		<div>
			<table
				className="w-full text-sm border-collapse"
				aria-label="Notification preferences"
			>
				<thead>
					<tr className="border-b border-border-subtle">
						<th className="text-left py-2 pr-4 text-text-secondary font-medium">
							Event
						</th>
						{CHANNELS.map((ch) => (
							<th
								key={ch}
								className="text-center py-2 px-3 capitalize text-text-secondary font-medium"
							>
								{ch === "in_app" ? "In-app" : "Email"}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{groups.map(({ domain, types: domainTypes }, gi) => (
						<>
							<tr
								key={`domain-${domain}`}
								className={gi > 0 ? "border-t-2 border-border-subtle" : ""}
							>
								<td
									colSpan={3}
									className="pt-3 pb-1 text-label uppercase text-text-tertiary font-semibold tracking-wide"
								>
									{getDomainLabel(domain)}
								</td>
							</tr>
							{domainTypes.map((type) => {
								const isSecurity = SECURITY_TYPES.has(type);
								return (
									<tr
										key={type}
										className="border-b border-border-subtle hover:bg-surface-hover/50 transition-colors"
									>
										<td className="py-2 pr-4 text-body text-text-primary">
											<span className="flex items-center gap-2">
												{getEventLabel(type)}
												{isSecurity && (
													<StatusPill tone="coral" label="Security" />
												)}
											</span>
										</td>
										{CHANNELS.map((ch) => (
											<td key={ch} className="text-center py-2 px-3">
												{isSecurity ? (
													<span title="Security notifications can't be disabled">
														<input
															type="checkbox"
															checked={isEnabled(type, ch)}
															disabled
															aria-disabled="true"
															aria-label={`${getEventLabel(type)} ${ch} (always on)`}
															className="cursor-not-allowed opacity-50"
														/>
													</span>
												) : (
													<input
														type="checkbox"
														checked={isEnabled(type, ch)}
														onChange={() => onToggle(type, ch)}
														aria-label={`${getEventLabel(type)} ${ch === "in_app" ? "in-app" : "email"}`}
														className="cursor-pointer"
													/>
												)}
											</td>
										))}
									</tr>
								);
							})}
						</>
					))}
				</tbody>
			</table>

			{/* Card-bottom save row — no sticky bar */}
			<div className="mt-4 flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
				{!dirty && (
					<span className="text-small text-mint flex items-center gap-1">
						<svg
							className="size-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						All preferences saved
					</span>
				)}
				<Button onClick={onSave} disabled={saving || !dirty} size="sm">
					{saving ? "Saving…" : "Save preferences"}
				</Button>
			</div>
		</div>
	);
}

// ────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────

export default function PreferencesPage() {
	const { user, logout, refreshMe } = useAuth();
	const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [locale, setLocale] = useState("en-MY");
	const [signOutConfirm, setSignOutConfirm] = useState(false);

	useEffect(() => {
		getPreferences().then((p) => {
			setPrefs(p);
			setDirty(false);
		});
		if (user?.preferences?.locale) {
			setLocale(user.preferences.locale as string);
		}
	}, [user]);

	function toggle(type: string, channel: "in_app" | "email") {
		if (SECURITY_TYPES.has(type)) return;
		setPrefs((prev) =>
			prev.map((p) =>
				p.type === type && p.channel === channel
					? { ...p, enabled: !p.enabled }
					: p,
			),
		);
		setDirty(true);
	}

	async function saveNotifPrefs() {
		setSaving(true);
		const updates = prefs
			.filter((p) => !SECURITY_TYPES.has(p.type))
			.map((p) => ({ type: p.type, channel: p.channel, enabled: p.enabled }));
		await updatePreferences(updates);
		setSaving(false);
		setDirty(false);
		toast.success("Notification preferences saved");
	}

	async function saveLocale(newLocale: string) {
		setLocale(newLocale);
		try {
			const resp = await authFetch(`${BASE_URL}/api/v1/auth/me`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ preferences: { locale: newLocale } }),
			});
			if (resp.ok) {
				await refreshMe();
				toast.success("Locale updated");
			}
		} catch {
			toast.error("Failed to save locale");
		}
	}

	async function handleSignOutEverywhere() {
		try {
			await authFetch(`${BASE_URL}/api/v1/auth/sessions/revoke-all`, {
				method: "POST",
			});
		} catch {
			// best-effort
		}
		await logout();
	}

	return (
		<div className="space-y-6">
			<PageHeader
				breadcrumb="Personal"
				title="My Preferences"
				subtitle="Account settings, notifications, and security."
			/>

			{/* ── General ────────────────────────────────────────── */}
			<section
				id="section-general"
				className="bg-surface-hover border border-border-subtle rounded-lg p-5"
			>
				<header className="mb-4">
					<h2 className="text-h2 text-text-primary">General</h2>
					<p className="text-body text-text-secondary mt-1">
						Language and regional display preferences.
					</p>
				</header>

				<p className="text-label uppercase text-text-tertiary mb-2">
					Language / region
				</p>
				<div className="flex items-center gap-3">
					<label className="sr-only" htmlFor="locale-select">
						Language / region
					</label>
					<select
						id="locale-select"
						value={locale}
						onChange={(e) => saveLocale(e.target.value)}
						className="bg-canvas border border-border-subtle rounded-md px-3 py-1.5 text-body text-text-primary"
					>
						<option value="en-MY">English (Malaysia)</option>
					</select>
				</div>

				{/* Theme — deferred to Phase 1.5, shown as disabled row */}
				<div className="mt-5">
					<p className="text-label uppercase text-text-tertiary mb-2">Theme</p>
					<div
						aria-disabled="true"
						className="opacity-60 cursor-not-allowed pointer-events-none rounded-md border border-border-subtle bg-canvas px-4 py-3 flex items-center justify-between"
					>
						<div>
							<p className="text-body text-text-primary">Dark / light theme</p>
							<p className="text-small text-text-secondary">
								Choose between dark and light appearance.
							</p>
						</div>
						<StatusPill tone="lavender" label="Phase 1.5" />
					</div>
				</div>
			</section>

			{/* ── Two-step verification ──────────────────────────── */}
			<MFASection />

			{/* ── Notifications ─────────────────────────────────── */}
			<section
				id="section-notifications"
				className="bg-surface-hover border border-border-subtle rounded-lg p-5"
			>
				<header className="mb-4">
					<h2 className="text-h2 text-text-primary">Notifications</h2>
					<p className="text-body text-text-secondary mt-1">
						Choose how you want to be notified for each event. Security events
						can't be disabled.
					</p>
				</header>

				<NotificationMatrix
					prefs={prefs}
					onToggle={toggle}
					onSave={saveNotifPrefs}
					saving={saving}
					dirty={dirty}
				/>
			</section>

			{/* ── Danger zone ────────────────────────────────────── */}
			<section
				id="section-danger"
				className="bg-surface-hover border border-coral/30 rounded-lg p-5"
			>
				<header className="mb-4">
					<h2 className="text-h2 text-text-primary">Danger zone</h2>
					<p className="text-body text-text-secondary mt-1">
						Destructive actions that affect your account access.
					</p>
				</header>

				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-body text-text-primary font-medium">
							Sign out everywhere
						</p>
						<p className="text-small text-text-secondary">
							Revoke all active sessions on all devices including this one.
						</p>
					</div>
					{signOutConfirm ? (
						<div className="flex flex-col items-end gap-2 shrink-0">
							<p className="text-small text-coral">
								This will sign out all active sessions including this one.
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleSignOutEverywhere}
									className="px-4 py-2 bg-coral text-white rounded text-sm hover:opacity-90"
								>
									Confirm sign out
								</button>
								<button
									type="button"
									onClick={() => setSignOutConfirm(false)}
									className="px-3 py-2 border border-border-subtle text-text-secondary rounded text-sm hover:bg-surface-hover"
								>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setSignOutConfirm(true)}
							className="shrink-0 px-4 py-2 border border-coral/40 text-coral rounded text-sm hover:bg-coral/10"
						>
							Sign out all sessions
						</button>
					)}
				</div>
			</section>
		</div>
	);
}
