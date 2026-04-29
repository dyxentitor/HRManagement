import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { useAuth } from "@/lib/auth";

import {
	type NotificationPreference,
	getPreferences,
	updatePreferences,
} from "../../notifications/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const SECURITY_TYPES = new Set([
	"auth.login",
	"auth.password_changed",
	"auth.mfa_enabled",
	"auth.mfa_disabled",
	"employee.bank_changed_self",
]);

const CHANNELS: Array<"in_app" | "email"> = ["in_app", "email"];

async function authFetch(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	const { tokenStorage } = await import("@/lib/token-storage");
	const token = tokenStorage.getAccess();
	const headers = new Headers(options.headers);
	if (token) headers.set("Authorization", `Bearer ${token}`);
	return fetch(url, { ...options, headers });
}

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
		} catch (e) {
			setError(e instanceof Error ? e.message : "Error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h2 className="text-h3 text-text-primary mb-3">Two-step verification</h2>
			{error && (
				<p role="alert" className="text-coral text-small mb-2">
					{error}
				</p>
			)}
			{mfaEnabled ? (
				<div className="flex items-center gap-3">
					<span className="px-2.5 py-0.5 bg-mint/15 text-mint text-small font-semibold rounded-full">
						Enabled
					</span>
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
// Main page
// ────────────────────────────────────────────────────────────

export default function PreferencesPage() {
	const { user, logout, refreshMe } = useAuth();
	const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [locale, setLocale] = useState("en-MY");
	const [localeMsg, setLocaleMsg] = useState<string | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		getPreferences().then(setPrefs);
		if (user?.preferences?.locale) {
			setLocale(user.preferences.locale as string);
		}
	}, [user]);

	const prefMap = new Map<string, NotificationPreference>();
	for (const p of prefs) {
		prefMap.set(`${p.type}:${p.channel}`, p);
	}

	const types = [...new Set(prefs.map((p) => p.type))].sort();

	function isEnabled(type: string, channel: "in_app" | "email"): boolean {
		return prefMap.get(`${type}:${channel}`)?.enabled ?? true;
	}

	function toggle(type: string, channel: "in_app" | "email") {
		if (SECURITY_TYPES.has(type)) return;
		setPrefs((prev) =>
			prev.map((p) =>
				p.type === type && p.channel === channel
					? { ...p, enabled: !p.enabled }
					: p,
			),
		);
	}

	async function saveNotifPrefs() {
		setSaving(true);
		const updates = prefs
			.filter((p) => !SECURITY_TYPES.has(p.type))
			.map((p) => ({ type: p.type, channel: p.channel, enabled: p.enabled }));
		await updatePreferences(updates);
		setSaving(false);
		setSaved(true);
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
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
				setLocaleMsg("Saved");
				setTimeout(() => setLocaleMsg(null), 2000);
			}
		} catch {
			setLocaleMsg("Failed to save");
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
		<div className="space-y-6 max-w-3xl">
			<PageHeader breadcrumb="Personal" title="My Preferences" />

			{/* Locale */}
			<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				<h2 className="text-h3 text-text-primary mb-3">Locale</h2>
				<div className="flex items-center gap-3">
					<label
						className="text-small text-text-tertiary"
						htmlFor="locale-select"
					>
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
					{localeMsg && (
						<span className="text-mint text-small">{localeMsg}</span>
					)}
				</div>
			</section>

			{/* Theme — deferred */}
			<section className="bg-surface-hover border border-border-subtle rounded-lg p-4 opacity-60">
				<h2 className="text-h3 text-text-primary mb-1">Theme</h2>
				<p className="text-body text-text-secondary">
					Dark / light theme toggle — Coming soon (Phase 1.5)
				</p>
			</section>

			{/* MFA */}
			<MFASection />

			{/* Notification preferences */}
			<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				<h2 className="text-h3 text-text-primary mb-3">
					Notification preferences
				</h2>
				<table className="w-full text-sm border-collapse">
					<thead>
						<tr className="border-b border-border-subtle">
							<th className="text-left py-2 pr-4 text-text-secondary">Event</th>
							{CHANNELS.map((ch) => (
								<th
									key={ch}
									className="text-center py-2 px-3 capitalize text-text-secondary"
								>
									{ch.replace("_", " ")}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{types.map((type) => (
							<tr
								key={type}
								className="border-b border-border-subtle hover:bg-surface-hover transition-colors"
							>
								<td className="py-2 pr-4 font-mono text-xs text-text-secondary">
									{type}
									{SECURITY_TYPES.has(type) && (
										<span className="ml-2 text-yellow text-xs">(security)</span>
									)}
								</td>
								{CHANNELS.map((ch) => (
									<td key={ch} className="text-center py-2 px-3">
										<input
											type="checkbox"
											checked={isEnabled(type, ch)}
											disabled={SECURITY_TYPES.has(type)}
											onChange={() => toggle(type, ch)}
											className="cursor-pointer disabled:cursor-not-allowed"
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
				<div className="mt-4 flex items-center gap-3">
					<button
						type="button"
						onClick={saveNotifPrefs}
						disabled={saving}
						className="px-4 py-2 bg-accent-500 text-white rounded text-sm hover:bg-accent-600 disabled:opacity-50"
					>
						{saving ? "Saving…" : "Save preferences"}
					</button>
					{saved && <span className="text-mint text-sm">Saved!</span>}
				</div>
			</section>

			{/* Sign out everywhere */}
			<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				<h2 className="text-h3 text-text-primary mb-1">Sign out everywhere</h2>
				<p className="text-body text-text-secondary mb-3">
					Revoke all active sessions on all devices and sign out immediately.
				</p>
				<button
					type="button"
					onClick={handleSignOutEverywhere}
					className="px-4 py-2 border border-coral/40 text-coral rounded text-sm hover:bg-coral/10"
				>
					Sign out all sessions
				</button>
			</section>
		</div>
	);
}
