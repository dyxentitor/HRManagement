import { useCallback, useEffect, useState } from "react";

import { LogoUploader } from "@/components/hrms/LogoUploader";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCan } from "@/lib/perm";

import { type OrgSettings, settingsApi } from "./settings-api";

type FormFields = Pick<
	OrgSettings,
	"name" | "default_currency" | "default_timezone" | "default_locale"
>;

export default function OrganizationSettingsPage() {
	const [org, setOrg] = useState<OrgSettings | null>(null);
	const [form, setForm] = useState<FormFields>({
		name: "",
		default_currency: "",
		default_timezone: "",
		default_locale: "",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// GET /org/settings requires org:settings:read. Gate the fetch on it so
	// manager-tier users who navigate directly to this URL get a clean message
	// instead of a 403 XHR (mirrors SettingsNav's overview-fetch gating).
	const canRead = useCan("org:settings:read");

	const refresh = useCallback(async () => {
		if (!canRead) return;
		try {
			const fresh = await settingsApi.getOrg();
			setOrg(fresh);
			setForm({
				name: fresh.name,
				default_currency: fresh.default_currency,
				default_timezone: fresh.default_timezone,
				default_locale: fresh.default_locale,
			});
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to load");
		}
	}, [canRead]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const fresh = await settingsApi.patchOrg(form);
			setOrg(fresh);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Save failed");
		} finally {
			setSaving(false);
		}
	}

	function resetForm() {
		// v1.9.2 info-fix: Cancel restores fields from already-fetched org state,
		// instead of triggering a server refetch (avoids the brief loading flash).
		if (!org) return;
		setForm({
			name: org.name,
			default_currency: org.default_currency,
			default_timezone: org.default_timezone,
			default_locale: org.default_locale,
		});
		setError(null);
	}

	if (!canRead) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Organization" />
				<p className="text-text-tertiary">
					You don't have permission to view organization settings.
				</p>
			</div>
		);
	}

	if (!org) {
		return <div className="text-text-secondary">Loading…</div>;
	}

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Organization"
				subtitle="Branding and identity shown across the app."
			/>

			<Section title="Branding">
				<FieldRow label="Company logo">
					<LogoUploader
						currentLogoUrl={org.logo_url}
						orgName={org.name}
						onChanged={refresh}
					/>
				</FieldRow>
				<FieldRow label="Display name" htmlFor="org-name">
					<Input
						id="org-name"
						aria-label="Display name"
						value={form.name}
						onChange={(e) => setForm({ ...form, name: e.target.value })}
					/>
				</FieldRow>
			</Section>

			<Section title="Identity">
				<FieldRow label="Default currency" htmlFor="org-cur">
					<Input
						id="org-cur"
						aria-label="Default currency"
						value={form.default_currency}
						onChange={(e) =>
							setForm({ ...form, default_currency: e.target.value })
						}
					/>
				</FieldRow>
				<FieldRow label="Default timezone" htmlFor="org-tz">
					<Input
						id="org-tz"
						aria-label="Default timezone"
						value={form.default_timezone}
						onChange={(e) =>
							setForm({ ...form, default_timezone: e.target.value })
						}
					/>
				</FieldRow>
				<FieldRow label="Default locale" htmlFor="org-loc">
					<Input
						id="org-loc"
						aria-label="Default locale"
						value={form.default_locale}
						onChange={(e) =>
							setForm({ ...form, default_locale: e.target.value })
						}
					/>
				</FieldRow>
			</Section>

			{error && <div className="text-coral text-small">{error}</div>}

			<div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
				<Button
					type="button"
					variant="ghost"
					onClick={resetForm}
					disabled={saving}
				>
					Cancel
				</Button>
				<Button type="button" onClick={save} disabled={saving}>
					{saving ? "Saving…" : "Save changes"}
				</Button>
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-border-subtle bg-surface p-4">
			<h4 className="text-label uppercase text-text-tertiary mb-3">{title}</h4>
			{children}
		</div>
	);
}

function FieldRow({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[180px_1fr] gap-3 py-2 border-b border-border-subtle last:border-b-0 items-start">
			<label htmlFor={htmlFor} className="text-body text-text-primary pt-2">
				{label}
			</label>
			<div>{children}</div>
		</div>
	);
}
