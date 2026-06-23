import {
	Briefcase,
	ChevronDown,
	ChevronRight,
	Heart,
	Landmark,
	MapPin,
	Phone,
	User,
} from "lucide-react";
import type React from "react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { Employee, EmployeeWritePayload } from "../api";
import { useFieldPerm } from "../lib/useFieldPerm";
import { AvatarUpload } from "./AvatarUpload";
import { EncryptedFieldInput } from "./EncryptedFieldInput";
import { ManagerPicker } from "./ManagerPicker";

type Mode = "create" | "edit";

interface Section {
	id: "identity" | "employment" | "personal" | "address" | "banking" | "emergency";
	label: string;
	icon: ComponentType<{ className?: string }>;
}

const SECTIONS: Section[] = [
	{ id: "identity", label: "Identity", icon: User },
	{ id: "employment", label: "Employment", icon: Briefcase },
	{ id: "personal", label: "Personal", icon: Heart },
	{ id: "address", label: "Address", icon: MapPin },
	{ id: "banking", label: "Banking & Tax IDs", icon: Landmark },
	{ id: "emergency", label: "Emergency Contact", icon: Phone },
];

interface DeptRef {
	id: string;
	name: string;
}
interface TeamRef {
	id: string;
	name: string;
}
interface ManagerOption {
	id: string;
	full_name: string;
	role_title?: string;
}

export interface EmployeeFormProps {
	mode: Mode;
	initial: Employee | null;
	departments: DeptRef[];
	teams: TeamRef[];
	managerOptions: ManagerOption[];
	onSubmit: (
		payload: Partial<EmployeeWritePayload>,
		replacedEncrypted: Set<string>,
	) => Promise<void> | void;
	onCancel: () => void;
	fieldErrors?: Record<string, string>;
	topError?: string;
	saving?: boolean;
	roles?: { code: string; name: string }[];
	canProvision?: boolean;
}

type ProvisionPayload = {
	provision: {
		role_code: string;
		credential_method: "invite" | "temp";
		temp_password?: string;
	};
};

const REQUIRED_FIELDS_CREATE: (keyof EmployeeWritePayload)[] = [
	"employee_code",
	"first_name",
	"last_name",
	"email",
	"hire_date",
	"department",
	"employment_type",
];

export function EmployeeForm({
	mode,
	initial,
	departments,
	teams,
	managerOptions,
	onSubmit,
	onCancel,
	fieldErrors = {},
	topError,
	saving = false,
	roles = [],
	canProvision = false,
}: EmployeeFormProps) {
	const writeOrg = useFieldPerm(null, "employee:write:org");
	const assignTeam = useFieldPerm(null, "employee:assign:team");
	const bank = useFieldPerm("employee:bank:read", "employee:bank:write");

	const [collapsed, setCollapsed] = useState<Set<string>>(() =>
		mode === "edit"
			? // edit: collapsed-by-default (progressive disclosure, scannable summaries)
				new Set(SECTIONS.map((s) => s.id))
			: // create: keep the required-field sections open, collapse the optional ones
				new Set(["personal", "address", "banking", "emergency"]),
	);
	const [draft, setDraft] = useState<Partial<EmployeeWritePayload>>(() => ({
		employee_code: initial?.employee_code ?? "",
		first_name: initial?.first_name ?? "",
		last_name: initial?.last_name ?? "",
		preferred_name: initial?.preferred_name ?? "",
		email: initial?.email ?? "",
		personal_email: initial?.personal_email ?? "",
		phone: initial?.phone ?? "",
		alt_phone: initial?.alt_phone ?? "",
		date_of_birth: initial?.date_of_birth ?? "",
		gender: initial?.gender ?? "",
		nationality: initial?.nationality ?? "",
		marital_status: initial?.marital_status ?? "",
		religion: initial?.religion ?? "",
		address_line1: initial?.address_line1 ?? "",
		address_line2: initial?.address_line2 ?? "",
		city: initial?.city ?? "",
		state: initial?.state ?? "",
		postcode: initial?.postcode ?? "",
		country_code: initial?.country_code ?? "MY",
		department: initial?.department_id ?? "",
		team: initial?.team ?? null,
		manager: initial?.manager ?? null,
		role_title: initial?.role_title ?? "",
		employment_type: initial?.employment_type ?? "fulltime",
		schedule_type: "fixed",
		hire_date: initial?.hire_date ?? "",
		status: initial?.status ?? "active",
		bank_name: initial?.bank_name ?? "",
		emergency_contact_name: "",
		emergency_contact_relationship: "",
		emergency_contact_phone: "",
	}));
	const [replaced, setReplaced] = useState<Set<string>>(new Set());

	const [provisionOn, setProvisionOn] = useState(false);
	const [roleCode, setRoleCode] = useState("employee");
	const [credMethod, setCredMethod] = useState<"invite" | "temp">("invite");
	const [tempPw, setTempPw] = useState("");

	const showProvision = mode === "create" && canProvision;

	const set = <K extends keyof EmployeeWritePayload>(k: K, v: EmployeeWritePayload[K]) =>
		setDraft((d) => ({ ...d, [k]: v }));

	const setEncrypted = (field: string, v: string) => {
		setReplaced((r) => new Set(r).add(field));
		setDraft((d) => ({ ...d, [field]: v }));
	};

	const allRequiredFilled = useMemo(() => {
		if (mode === "edit") return true;
		return REQUIRED_FIELDS_CREATE.every((k) => {
			const v = draft[k];
			return typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined;
		});
	}, [draft, mode]);

	function toggle(id: string) {
		setCollapsed((c) => {
			const n = new Set(c);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	}

	/** One-line preview of a collapsed section's data (— when empty). */
	function summaryFor(id: Section["id"]): string {
		const d = draft;
		const dash = "—";
		const join = (parts: (string | undefined)[], sep = " · ") =>
			parts.filter(Boolean).join(sep) || dash;
		switch (id) {
			case "identity":
				return join([`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim(), d.employee_code]);
			case "employment":
				return join([
					d.role_title,
					departments.find((x) => x.id === d.department)?.name,
					d.employment_type,
				]);
			case "personal":
				return join([d.gender, d.nationality, d.date_of_birth]);
			case "address":
				return join([d.city, d.state, d.country_code], ", ");
			case "banking":
				return d.bank_name ? `${d.bank_name} · tax IDs encrypted` : dash;
			case "emergency":
				return join([d.emergency_contact_name, d.emergency_contact_relationship]);
			default:
				return dash;
		}
	}

	function handleSave(e: React.FormEvent) {
		e.preventDefault();
		// Drop blank optional fields. An empty string sent for a nullable date /
		// choice field (e.g. date_of_birth) makes DRF return a 400 ("Date has
		// wrong format"), which is the root cause of the create failure. Omitting
		// the key lets the backend apply null / its default instead. Required
		// fields are guaranteed non-empty (Save is disabled otherwise).
		const payload: Partial<EmployeeWritePayload> = {};
		for (const [k, v] of Object.entries(draft)) {
			if (v === "") continue;
			(payload as Record<string, unknown>)[k] = v;
		}
		if (showProvision && provisionOn) {
			(payload as Partial<EmployeeWritePayload> & ProvisionPayload).provision = {
				role_code: roleCode,
				credential_method: credMethod,
				...(credMethod === "temp" ? { temp_password: tempPw } : {}),
			};
		}
		void onSubmit(payload, replaced);
	}

	return (
		<form onSubmit={handleSave} className="space-y-4 pb-2">
			{topError && (
				<p role="alert" className="text-coral text-small">
					{topError}
				</p>
			)}

			{mode === "create" && (
				<p className="text-small text-text-tertiary">
					Fields marked <span className="text-coral">*</span> are required. You can complete the
					rest later.
				</p>
			)}

			{SECTIONS.map((s) => {
				if (s.id === "banking" && !bank.canRead) return null;
				const isCollapsed = collapsed.has(s.id);
				return (
					<section key={s.id} className="bg-surface-hover border border-border-subtle rounded-lg">
						<button
							type="button"
							aria-label={`Toggle ${s.label}`}
							aria-expanded={!isCollapsed}
							onClick={() => toggle(s.id)}
							className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-elevated/20 rounded-lg"
						>
							<s.icon className="size-4 text-text-tertiary shrink-0" />
							<div className="min-w-0 flex-1">
								<h2 className="text-h3 text-text-primary">{s.label}</h2>
								{isCollapsed && (
									<p className="text-small text-text-tertiary truncate">{summaryFor(s.id)}</p>
								)}
							</div>
							{isCollapsed ? (
								<ChevronRight className="size-4 text-text-tertiary shrink-0" />
							) : (
								<ChevronDown className="size-4 text-text-tertiary shrink-0" />
							)}
						</button>
						{!isCollapsed && (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4">
								{renderSection(s.id, {
									draft,
									set,
									setEncrypted,
									initial,
									fieldErrors,
									departments,
									teams,
									managerOptions,
									writeOrg,
									assignTeam,
									bank,
								})}
							</div>
						)}
					</section>
				);
			})}

			{showProvision && (
				<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
					<header className="flex items-center justify-between mb-3">
						<h2 className="text-h3 text-text-primary">Provision login account</h2>
						<Switch
							aria-label="Provision login account"
							checked={provisionOn}
							onCheckedChange={(v) => setProvisionOn(v)}
						/>
					</header>
					{provisionOn && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{field(
								"provision_role",
								"Role",
								<select
									id="provision_role"
									className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
									value={roleCode}
									onChange={(e) => setRoleCode(e.target.value)}
								>
									{roles.map((r) => (
										<option key={r.code} value={r.code}>
											{r.name}
										</option>
									))}
								</select>,
							)}
							{field(
								"provision_method",
								"Credential method",
								<select
									id="provision_method"
									className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
									value={credMethod}
									onChange={(e) => setCredMethod(e.target.value as "invite" | "temp")}
								>
									<option value="invite">Send email invite</option>
									<option value="temp">Set temporary password</option>
								</select>,
							)}
							{credMethod === "temp" &&
								field(
									"provision_temp_password",
									"Temporary password",
									<Input
										id="provision_temp_password"
										type="text"
										value={tempPw}
										onChange={(e) => setTempPw(e.target.value)}
									/>,
								)}
						</div>
					)}
				</section>
			)}

			<div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle p-4 flex items-center justify-end gap-2 shadow-lg">
				<Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
					Cancel
				</Button>
				<Button type="submit" disabled={saving || (mode === "create" && !allRequiredFilled)}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</form>
	);
}

interface SectionRenderArgs {
	draft: Partial<EmployeeWritePayload>;
	set: <K extends keyof EmployeeWritePayload>(k: K, v: EmployeeWritePayload[K]) => void;
	setEncrypted: (field: string, v: string) => void;
	initial: Employee | null;
	fieldErrors: Record<string, string>;
	departments: DeptRef[];
	teams: TeamRef[];
	managerOptions: ManagerOption[];
	writeOrg: { canWrite: boolean };
	assignTeam: { canWrite: boolean };
	bank: { canRead: boolean; canWrite: boolean };
}

function field(
	id: string,
	label: string,
	child: React.ReactNode,
	err?: string,
	required?: boolean,
) {
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-label uppercase text-text-tertiary">
				{label}
				{required && <span className="text-coral"> *</span>}
			</label>
			{child}
			{err && (
				<span role="alert" className="text-small text-coral">
					{err}
				</span>
			)}
		</div>
	);
}

function renderSection(id: Section["id"], a: SectionRenderArgs): React.ReactNode {
	const ro = !a.writeOrg.canWrite;
	switch (id) {
		case "identity":
			return (
				<>
					{a.initial?.id && (
						<div className="sm:col-span-2">
							<AvatarUpload
								photoUrl={a.initial.photo_url ?? null}
								fullName={a.initial.full_name ?? "Employee"}
								size="md"
								uploadFor={{ kind: "employee", id: a.initial.id }}
								onUploaded={() => {}}
								onDeleted={() => {}}
							/>
						</div>
					)}
					{field(
						"first_name",
						"First name",
						<Input
							id="first_name"
							readOnly={ro}
							value={a.draft.first_name ?? ""}
							onChange={(e) => a.set("first_name", e.target.value)}
						/>,
						a.fieldErrors.first_name,
						true,
					)}
					{field(
						"last_name",
						"Last name",
						<Input
							id="last_name"
							readOnly={ro}
							value={a.draft.last_name ?? ""}
							onChange={(e) => a.set("last_name", e.target.value)}
						/>,
						a.fieldErrors.last_name,
						true,
					)}
					{field(
						"preferred_name",
						"Preferred name",
						<Input
							id="preferred_name"
							readOnly={ro}
							value={a.draft.preferred_name ?? ""}
							onChange={(e) => a.set("preferred_name", e.target.value)}
						/>,
					)}
					{field(
						"email",
						"Company email (login)",
						<Input
							id="email"
							type="email"
							readOnly={ro}
							value={a.draft.email ?? ""}
							onChange={(e) => a.set("email", e.target.value)}
						/>,
						a.fieldErrors.email,
						true,
					)}
					{field(
						"personal_email",
						"Personal email (invite is sent here)",
						<Input
							id="personal_email"
							type="email"
							readOnly={ro}
							placeholder="e.g. jane@gmail.com"
							value={a.draft.personal_email ?? ""}
							onChange={(e) => a.set("personal_email", e.target.value)}
						/>,
						a.fieldErrors.personal_email,
					)}
					{field(
						"employee_code",
						"Employee code",
						<Input
							id="employee_code"
							readOnly={ro}
							value={a.draft.employee_code ?? ""}
							onChange={(e) => a.set("employee_code", e.target.value)}
						/>,
						a.fieldErrors.employee_code,
						true,
					)}
				</>
			);
		case "employment":
			return (
				<>
					{field(
						"department",
						"Department",
						<select
							id="department"
							disabled={ro}
							className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={a.draft.department ?? ""}
							onChange={(e) => a.set("department", e.target.value)}
						>
							<option value="">—</option>
							{a.departments.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>,
						a.fieldErrors.department,
						true,
					)}
					{field(
						"team",
						"Team",
						<select
							id="team"
							disabled={!a.writeOrg.canWrite && !a.assignTeam.canWrite}
							className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={a.draft.team ?? ""}
							onChange={(e) => a.set("team", e.target.value || null)}
						>
							<option value="">(no team)</option>
							{a.teams.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>,
					)}
					<div className="sm:col-span-2">
						<span className="text-label uppercase text-text-tertiary block mb-1">Manager</span>
						<ManagerPicker
							value={a.draft.manager ?? null}
							excludeIds={a.initial?.id ? [a.initial.id] : []}
							options={a.managerOptions}
							onChange={(id) => a.set("manager", id)}
						/>
					</div>
					{field(
						"role_title",
						"Role title",
						<Input
							id="role_title"
							readOnly={ro}
							value={a.draft.role_title ?? ""}
							onChange={(e) => a.set("role_title", e.target.value)}
						/>,
						a.fieldErrors.role_title,
					)}
					{field(
						"employment_type",
						"Employment type",
						<select
							id="employment_type"
							disabled={ro}
							className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={a.draft.employment_type ?? ""}
							onChange={(e) => a.set("employment_type", e.target.value)}
						>
							<option value="fulltime">Full-time</option>
							<option value="parttime">Part-time</option>
							<option value="contract">Contract</option>
							<option value="intern">Intern</option>
						</select>,
						a.fieldErrors.employment_type,
						true,
					)}
					{field(
						"hire_date",
						"Hire date",
						<Input
							id="hire_date"
							type="date"
							readOnly={ro}
							value={a.draft.hire_date ?? ""}
							onChange={(e) => a.set("hire_date", e.target.value)}
						/>,
						a.fieldErrors.hire_date,
						true,
					)}
					{field(
						"status",
						"Status",
						<select
							id="status"
							disabled={ro}
							className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={a.draft.status ?? ""}
							onChange={(e) => a.set("status", e.target.value)}
						>
							<option value="active">Active</option>
							<option value="probation">Probation</option>
							<option value="on_leave">On leave</option>
							<option value="terminated">Terminated</option>
							<option value="resigned">Resigned</option>
						</select>,
					)}
				</>
			);
		case "personal":
			return (
				<>
					{field(
						"date_of_birth",
						"Date of birth",
						<Input
							id="date_of_birth"
							type="date"
							readOnly={ro}
							value={a.draft.date_of_birth ?? ""}
							onChange={(e) => a.set("date_of_birth", e.target.value)}
						/>,
						a.fieldErrors.date_of_birth,
					)}
					{field(
						"gender",
						"Gender",
						<select
							id="gender"
							disabled={ro}
							className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={a.draft.gender ?? ""}
							onChange={(e) => a.set("gender", e.target.value)}
						>
							<option value="">—</option>
							<option value="male">Male</option>
							<option value="female">Female</option>
							<option value="other">Other</option>
							<option value="undisclosed">Undisclosed</option>
						</select>,
					)}
					{field(
						"nationality",
						"Nationality (ISO 2)",
						<Input
							id="nationality"
							maxLength={2}
							readOnly={ro}
							value={a.draft.nationality ?? ""}
							onChange={(e) => a.set("nationality", e.target.value.toUpperCase())}
						/>,
					)}
					{field(
						"marital_status",
						"Marital status",
						<select
							id="marital_status"
							disabled={ro}
							className="bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={a.draft.marital_status ?? ""}
							onChange={(e) => a.set("marital_status", e.target.value)}
						>
							<option value="">—</option>
							<option value="single">Single</option>
							<option value="married">Married</option>
							<option value="divorced">Divorced</option>
							<option value="widowed">Widowed</option>
						</select>,
					)}
					{field(
						"religion",
						"Religion",
						<Input
							id="religion"
							readOnly={ro}
							value={a.draft.religion ?? ""}
							onChange={(e) => a.set("religion", e.target.value)}
						/>,
					)}
					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1">IC number</span>
						<EncryptedFieldInput
							label="IC"
							last4={a.initial?.ic_last4 ?? null}
							onReplace={(v) => a.setEncrypted("ic_number", v)}
							canWrite={a.writeOrg.canWrite}
						/>
					</div>
				</>
			);
		case "address":
			return (
				<>
					{field(
						"address_line1",
						"Address line 1",
						<Input
							id="address_line1"
							readOnly={ro}
							value={a.draft.address_line1 ?? ""}
							onChange={(e) => a.set("address_line1", e.target.value)}
						/>,
						a.fieldErrors.address_line1,
					)}
					{field(
						"address_line2",
						"Address line 2",
						<Input
							id="address_line2"
							readOnly={ro}
							value={a.draft.address_line2 ?? ""}
							onChange={(e) => a.set("address_line2", e.target.value)}
						/>,
					)}
					{field(
						"city",
						"City",
						<Input
							id="city"
							readOnly={ro}
							value={a.draft.city ?? ""}
							onChange={(e) => a.set("city", e.target.value)}
						/>,
					)}
					{field(
						"state",
						"State",
						<Input
							id="state"
							readOnly={ro}
							value={a.draft.state ?? ""}
							onChange={(e) => a.set("state", e.target.value)}
						/>,
					)}
					{field(
						"postcode",
						"Postcode",
						<Input
							id="postcode"
							readOnly={ro}
							value={a.draft.postcode ?? ""}
							onChange={(e) => a.set("postcode", e.target.value)}
						/>,
					)}
					{field(
						"country_code",
						"Country (ISO 2)",
						<Input
							id="country_code"
							maxLength={2}
							readOnly={ro}
							value={a.draft.country_code ?? ""}
							onChange={(e) => a.set("country_code", e.target.value.toUpperCase())}
						/>,
					)}
					{field(
						"phone",
						"Phone",
						<Input
							id="phone"
							readOnly={ro}
							value={a.draft.phone ?? ""}
							onChange={(e) => a.set("phone", e.target.value)}
						/>,
					)}
					{field(
						"alt_phone",
						"Alt phone",
						<Input
							id="alt_phone"
							readOnly={ro}
							value={a.draft.alt_phone ?? ""}
							onChange={(e) => a.set("alt_phone", e.target.value)}
						/>,
					)}
				</>
			);
		case "banking":
			return (
				<>
					{field(
						"bank_name",
						"Bank name",
						<Input
							id="bank_name"
							readOnly={!a.bank.canWrite}
							value={a.draft.bank_name ?? ""}
							onChange={(e) => a.set("bank_name", e.target.value)}
						/>,
					)}
					<div>
						<span className="text-label uppercase text-text-tertiary block mb-1">
							Bank account number
						</span>
						<EncryptedFieldInput
							label="Bank acct"
							last4={a.initial?.bank_account_last4 ?? null}
							onReplace={(v) => a.setEncrypted("bank_account_number", v)}
							canWrite={a.bank.canWrite}
						/>
					</div>
					{(["lhdn_tax_no", "epf_no", "socso_no", "eis_no"] as const).map((f) => (
						<div key={f}>
							<span className="text-label uppercase text-text-tertiary block mb-1">
								{f.replace(/_/g, " ").replace(" no", "")}
							</span>
							<EncryptedFieldInput
								label={f}
								last4={null}
								onReplace={(v) => a.setEncrypted(f, v)}
								canWrite={a.bank.canWrite}
							/>
						</div>
					))}
				</>
			);
		case "emergency":
			return (
				<>
					{field(
						"emergency_contact_name",
						"Emergency contact name",
						<Input
							id="emergency_contact_name"
							readOnly={ro}
							value={a.draft.emergency_contact_name ?? ""}
							onChange={(e) => a.set("emergency_contact_name", e.target.value)}
						/>,
					)}
					{field(
						"emergency_contact_relationship",
						"Emergency contact relationship",
						<Input
							id="emergency_contact_relationship"
							readOnly={ro}
							value={a.draft.emergency_contact_relationship ?? ""}
							onChange={(e) => a.set("emergency_contact_relationship", e.target.value)}
						/>,
					)}
					{field(
						"emergency_contact_phone",
						"Emergency contact phone",
						<Input
							id="emergency_contact_phone"
							readOnly={ro}
							value={a.draft.emergency_contact_phone ?? ""}
							onChange={(e) => a.set("emergency_contact_phone", e.target.value)}
						/>,
					)}
				</>
			);
		default:
			return null;
	}
}
