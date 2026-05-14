import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/hrms";
import { MfaPrompt } from "@/components/hrms/MfaPrompt";
import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type EmployeeWritePayload, employeeApi } from "../api";
import { AvatarUpload } from "../components/AvatarUpload";

interface EmployeeProfile {
	employee_code: string;
	full_name: string;
	first_name?: string;
	last_name?: string;
	preferred_name?: string;
	email: string;
	phone: string;
	alt_phone?: string;
	role_title?: string;
	employment_type?: string;
	hire_date?: string;
	status?: string;
	department?: string;
	bank_name?: string;
	bank_account_last4?: string;
	ic_last4?: string;
	address_line1?: string;
	address_line2?: string;
	city?: string;
	state?: string;
	postcode?: string;
	country_code?: string;
	emergency_contact_name?: string;
	emergency_contact_phone?: string;
	emergency_contact_relationship?: string;
	photo_url?: string | null;
}

type SectionId = "personal" | "address" | "banking" | "emergency";

function tenureFromHireDate(hireDate?: string): string {
	if (!hireDate) return "—";
	const months = Math.max(
		0,
		Math.floor(
			(Date.now() - new Date(hireDate).getTime()) /
				(1000 * 60 * 60 * 24 * 30.42),
		),
	);
	return `${Math.floor(months / 12)}y ${months % 12}m`;
}

export default function MyProfilePage() {
	const [profile, setProfile] = useState<EmployeeProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<SectionId | null>(null);
	const [draft, setDraft] = useState<Partial<EmployeeWritePayload>>({});
	const [saving, setSaving] = useState(false);
	const [pendingMfa, setPendingMfa] =
		useState<Partial<EmployeeWritePayload> | null>(null);
	const [mfaError, setMfaError] = useState<string | undefined>(undefined);

	const refresh = useCallback(async () => {
		const data = (await employeeApi.getMe()) as EmployeeProfile | null;
		setProfile(data);
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await refresh();
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [refresh]);

	function startEdit(id: SectionId) {
		if (!profile) return;
		setEditing(id);
		setDraft({
			phone: profile.phone ?? "",
			alt_phone: profile.alt_phone ?? "",
			preferred_name: profile.preferred_name ?? "",
			address_line1: profile.address_line1 ?? "",
			address_line2: profile.address_line2 ?? "",
			city: profile.city ?? "",
			state: profile.state ?? "",
			postcode: profile.postcode ?? "",
			country_code: profile.country_code ?? "MY",
			bank_name: profile.bank_name ?? "",
			emergency_contact_name: profile.emergency_contact_name ?? "",
			emergency_contact_phone: profile.emergency_contact_phone ?? "",
			emergency_contact_relationship:
				profile.emergency_contact_relationship ?? "",
		});
	}

	function cancelEdit() {
		setEditing(null);
		setDraft({});
	}

	function setField<K extends keyof EmployeeWritePayload>(
		k: K,
		v: EmployeeWritePayload[K],
	) {
		setDraft((d) => ({ ...d, [k]: v }));
	}

	async function performSave(
		payload: Partial<EmployeeWritePayload>,
		mfaCode?: string,
	) {
		setSaving(true);
		setMfaError(undefined);
		try {
			await employeeApi.updateMe(payload, mfaCode);
			toast.success("Profile updated");
			await refresh();
			setEditing(null);
			setDraft({});
			setPendingMfa(null);
		} catch (err) {
			const e = err as { body?: Record<string, unknown>; status?: number };
			if (e.status === 400 && e.body && (e.body.mfa as string)) {
				setMfaError(e.body.mfa as string);
				return;
			}
			toast.error("Could not save");
			setPendingMfa(null);
		} finally {
			setSaving(false);
		}
	}

	function saveSection(section: SectionId) {
		const fieldsBySection: Record<SectionId, (keyof EmployeeWritePayload)[]> = {
			personal: ["phone", "alt_phone", "preferred_name"],
			address: [
				"address_line1",
				"address_line2",
				"city",
				"state",
				"postcode",
				"country_code",
			],
			banking: ["bank_name"],
			emergency: [
				"emergency_contact_name",
				"emergency_contact_phone",
				"emergency_contact_relationship",
			],
		};
		const payload: Partial<EmployeeWritePayload> = {};
		for (const k of fieldsBySection[section]) {
			(payload as Record<string, unknown>)[k] = draft[k];
		}

		if (
			section === "banking" &&
			profile &&
			draft.bank_name !== profile.bank_name
		) {
			setPendingMfa(payload);
			return;
		}
		void performSave(payload);
	}

	if (loading) return <p className="text-text-tertiary">Loading…</p>;
	if (error)
		return (
			<p role="alert" className="text-coral">
				{error}
			</p>
		);
	if (!profile)
		return (
			<div className="space-y-6">
				<PageHeader breadcrumb="Personal" title="My Profile" />
				<NotLinkedEmptyState scope="profile" />
			</div>
		);

	const tenure = tenureFromHireDate(profile.hire_date);
	const joined = profile.hire_date
		? new Date(profile.hire_date).toLocaleDateString("en-MY", {
				month: "short",
				year: "numeric",
			})
		: "—";

	return (
		<div className="space-y-6">
			<PageHeader breadcrumb="Personal" title="My Profile" />

			<div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
				<aside className="bg-surface-hover border border-border-subtle rounded-lg p-5 text-center">
					<AvatarUpload
						photoUrl={profile.photo_url ?? null}
						fullName={profile.full_name}
						onUploaded={() => void refresh()}
						onDeleted={() => void refresh()}
					/>
					<h2 className="text-h2 text-text-primary mt-2">
						{profile.full_name}
					</h2>
					{profile.role_title && (
						<p className="text-small text-accent-200 inline-block bg-accent-500/15 rounded-full px-2.5 py-0.5 mt-1">
							{profile.role_title}
							{profile.department ? ` · ${profile.department}` : ""}
						</p>
					)}
					<dl className="mt-3 text-small space-y-1.5">
						<div className="flex justify-between border-t border-border-subtle pt-1.5">
							<dt className="text-text-tertiary">Joined</dt>
							<dd className="text-text-primary">{joined}</dd>
						</div>
						<div className="flex justify-between border-t border-border-subtle pt-1.5">
							<dt className="text-text-tertiary">Tenure</dt>
							<dd className="text-text-primary">{tenure}</dd>
						</div>
						{profile.status && (
							<div className="flex justify-between border-t border-border-subtle pt-1.5">
								<dt className="text-text-tertiary">Status</dt>
								<dd className="text-text-primary">{profile.status}</dd>
							</div>
						)}
					</dl>
				</aside>

				<div className="space-y-3">
					<EditableSection
						id="personal"
						title="Personal"
						editing={editing}
						onEdit={() => startEdit("personal")}
						onCancel={cancelEdit}
						onSave={() => saveSection("personal")}
						saving={saving}
						readView={
							<dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-body">
								<Field k="Phone" v={profile.phone || "—"} />
								<Field k="Alt phone" v={profile.alt_phone || "—"} />
								<Field k="Email" v={profile.email} />
								<Field
									k="Preferred name"
									v={profile.preferred_name || profile.full_name}
								/>
								<Field
									k="IC"
									v={profile.ic_last4 ? `•••• ${profile.ic_last4}` : "—"}
									mono
								/>
							</dl>
						}
						editView={
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<LabeledInput
									label="Phone"
									value={draft.phone ?? ""}
									onChange={(v) => setField("phone", v)}
								/>
								<LabeledInput
									label="Alt phone"
									value={draft.alt_phone ?? ""}
									onChange={(v) => setField("alt_phone", v)}
								/>
								<LabeledInput
									label="Preferred name"
									value={draft.preferred_name ?? ""}
									onChange={(v) => setField("preferred_name", v)}
								/>
							</div>
						}
					/>

					<ReadOnlySection
						title="Employment"
						fields={[
							{ k: "Code", v: profile.employee_code, mono: true },
							{ k: "Type", v: profile.employment_type || "—" },
							{ k: "Department", v: profile.department || "—" },
							{ k: "Role", v: profile.role_title || "—" },
							{ k: "Hire date", v: profile.hire_date || "—" },
							{ k: "Status", v: profile.status || "—" },
						]}
					/>

					<EditableSection
						id="address"
						title="Address"
						editing={editing}
						onEdit={() => startEdit("address")}
						onCancel={cancelEdit}
						onSave={() => saveSection("address")}
						saving={saving}
						readView={
							<dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
								<Field k="Line 1" v={profile.address_line1 || "—"} />
								<Field k="Line 2" v={profile.address_line2 || "—"} />
								<Field k="City" v={profile.city || "—"} />
								<Field k="State" v={profile.state || "—"} />
								<Field k="Postcode" v={profile.postcode || "—"} />
								<Field k="Country" v={profile.country_code || "—"} />
							</dl>
						}
						editView={
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<LabeledInput
									label="Line 1"
									value={draft.address_line1 ?? ""}
									onChange={(v) => setField("address_line1", v)}
								/>
								<LabeledInput
									label="Line 2"
									value={draft.address_line2 ?? ""}
									onChange={(v) => setField("address_line2", v)}
								/>
								<LabeledInput
									label="City"
									value={draft.city ?? ""}
									onChange={(v) => setField("city", v)}
								/>
								<LabeledInput
									label="State"
									value={draft.state ?? ""}
									onChange={(v) => setField("state", v)}
								/>
								<LabeledInput
									label="Postcode"
									value={draft.postcode ?? ""}
									onChange={(v) => setField("postcode", v)}
								/>
								<LabeledInput
									label="Country"
									value={draft.country_code ?? ""}
									onChange={(v) => setField("country_code", v.toUpperCase())}
								/>
							</div>
						}
					/>

					<EditableSection
						id="banking"
						title="Banking"
						flagged
						flagLabel="MFA required"
						editing={editing}
						onEdit={() => startEdit("banking")}
						onCancel={cancelEdit}
						onSave={() => saveSection("banking")}
						saving={saving}
						readView={
							<dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
								<Field k="Bank" v={profile.bank_name || "—"} />
								<Field
									k="Account"
									v={
										profile.bank_account_last4
											? `•••• ${profile.bank_account_last4}`
											: "—"
									}
									mono
								/>
							</dl>
						}
						editView={
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<LabeledInput
									label="Bank name"
									value={draft.bank_name ?? ""}
									onChange={(v) => setField("bank_name", v)}
								/>
							</div>
						}
					/>

					<EditableSection
						id="emergency"
						title="Emergency contact"
						editing={editing}
						onEdit={() => startEdit("emergency")}
						onCancel={cancelEdit}
						onSave={() => saveSection("emergency")}
						saving={saving}
						readView={
							<dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body">
								<Field k="Name" v={profile.emergency_contact_name || "—"} />
								<Field k="Phone" v={profile.emergency_contact_phone || "—"} />
								<Field
									k="Relationship"
									v={profile.emergency_contact_relationship || "—"}
								/>
							</dl>
						}
						editView={
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<LabeledInput
									label="Name"
									value={draft.emergency_contact_name ?? ""}
									onChange={(v) => setField("emergency_contact_name", v)}
								/>
								<LabeledInput
									label="Phone"
									value={draft.emergency_contact_phone ?? ""}
									onChange={(v) => setField("emergency_contact_phone", v)}
								/>
								<LabeledInput
									label="Relationship"
									value={draft.emergency_contact_relationship ?? ""}
									onChange={(v) =>
										setField("emergency_contact_relationship", v)
									}
								/>
							</div>
						}
					/>
				</div>
			</div>

			{pendingMfa && (
				<MfaPrompt
					error={mfaError}
					onCancel={() => {
						setPendingMfa(null);
						setMfaError(undefined);
					}}
					onSubmit={(code) => void performSave(pendingMfa, code)}
				/>
			)}
		</div>
	);
}

function Field({
	k,
	v,
	mono,
}: {
	k: string;
	v: React.ReactNode;
	mono?: boolean;
}) {
	return (
		<div>
			<dt className="text-label uppercase text-text-tertiary">{k}</dt>
			<dd
				className={cn(
					"text-text-primary mt-0.5",
					mono && "font-mono text-small",
				)}
			>
				{v}
			</dd>
		</div>
	);
}

function LabeledInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-label uppercase text-text-tertiary">
				{label}
			</label>
			<Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
		</div>
	);
}

function ReadOnlySection({
	title,
	fields,
}: {
	title: string;
	fields: { k: string; v: React.ReactNode; mono?: boolean }[];
}) {
	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<header className="flex items-center justify-between mb-3">
				<h2 className="text-h3 text-text-primary">{title}</h2>
			</header>
			<dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-body">
				{fields.map((f) => (
					<Field key={f.k} {...f} />
				))}
			</dl>
		</section>
	);
}

interface EditableSectionProps {
	id: SectionId;
	title: string;
	editing: SectionId | null;
	onEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
	saving: boolean;
	readView: React.ReactNode;
	editView: React.ReactNode;
	flagged?: boolean;
	flagLabel?: string;
}

function EditableSection({
	id,
	title,
	editing,
	onEdit,
	onCancel,
	onSave,
	saving,
	readView,
	editView,
	flagged,
	flagLabel,
}: EditableSectionProps) {
	const isEditing = editing === id;
	return (
		<section
			className={cn(
				"bg-surface-hover border rounded-lg p-4",
				flagged ? "border-coral/30" : "border-border-subtle",
			)}
		>
			<header className="flex items-center justify-between mb-3">
				<h2 className="text-h3 text-text-primary flex items-center gap-2">
					{title}
					{flagged && flagLabel && (
						<StatusPill tone="coral" label={flagLabel} />
					)}
				</h2>
				{!isEditing && (
					<button
						type="button"
						onClick={onEdit}
						disabled={editing !== null}
						className="text-small text-accent-200 hover:text-accent-50 disabled:opacity-50"
					>
						Edit
					</button>
				)}
			</header>
			{isEditing ? editView : readView}
			{isEditing && (
				<div className="flex justify-end gap-2 mt-3">
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button type="button" onClick={onSave} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			)}
		</section>
	);
}
