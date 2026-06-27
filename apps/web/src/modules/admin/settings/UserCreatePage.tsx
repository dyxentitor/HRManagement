import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/lib/perm";
import { EmployeeCodeField } from "@/modules/employee/components/EmployeeCodeField";

import { type RoleSummary, roleApi, userApi } from "../api";
import { type Department, settingsApi } from "./settings-api";

const SELECT_CLASS = "bg-canvas border border-border-subtle rounded px-2 py-1.5";

const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
	{ value: "fulltime", label: "Full-time" },
	{ value: "parttime", label: "Part-time" },
	{ value: "contract", label: "Contract" },
	{ value: "intern", label: "Intern" },
];

export function UserCreatePage() {
	const canCreate = useCan("user:create");
	const navigate = useNavigate();

	const [roles, setRoles] = useState<RoleSummary[]>([]);
	const [departments, setDepartments] = useState<Department[]>([]);

	const [email, setEmail] = useState("");
	const [personalEmail, setPersonalEmail] = useState("");
	const [roleCode, setRoleCode] = useState("employee");
	const [credentialMethod, setCredentialMethod] = useState<"invite" | "temp">("invite");
	const [tempPassword, setTempPassword] = useState("");

	const [alsoCreateEmployee, setAlsoCreateEmployee] = useState(false);
	const [employeeCode, setEmployeeCode] = useState("");
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [employeeEmail, setEmployeeEmail] = useState("");
	const [hireDate, setHireDate] = useState("");
	const [department, setDepartment] = useState("");
	const [employmentType, setEmploymentType] = useState("fulltime");

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!canCreate) return;
		roleApi
			.list()
			.then((rs) => {
				setRoles(rs);
				if (rs.length > 0 && !rs.some((r) => r.code === "employee")) {
					setRoleCode(rs[0].code);
				}
			})
			.catch(() => setRoles([]));
		settingsApi
			.listDepartments()
			.then(setDepartments)
			.catch(() => setDepartments([]));
	}, [canCreate]);

	if (!canCreate) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="New user" breadcrumb="Settings · Users" />
				<div className="rounded-lg border border-border-subtle bg-surface p-6 text-small text-text-tertiary">
					You don't have permission to create users.
				</div>
			</div>
		);
	}

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const body: Parameters<typeof userApi.create>[0] = {
				email,
				role_code: roleCode,
				credential_method: credentialMethod,
				...(credentialMethod === "temp" ? { temp_password: tempPassword } : {}),
				...(personalEmail ? { invite_email: personalEmail } : {}),
			};
			if (alsoCreateEmployee) {
				body.employee = {
					employee_code: employeeCode,
					first_name: firstName,
					last_name: lastName,
					email: employeeEmail || email,
					...(personalEmail ? { personal_email: personalEmail } : {}),
					hire_date: hireDate,
					department,
					employment_type: employmentType,
				};
			}
			await userApi.create(body);
			toast.success("User created");
			navigate("/admin/people/accounts");
		} catch (ex: unknown) {
			const msg = ex instanceof Error ? ex.message : "Could not create user";
			setError(msg);
			toast.error(msg);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="New user"
				breadcrumb="Settings · Users"
				subtitle="Create a login account, optionally with an employee record."
			/>

			{error && (
				<div className="rounded-lg border border-coral/30 bg-coral/10 text-coral text-small p-3">
					{error}
				</div>
			)}

			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
					<h2 className="text-h3 text-text-primary mb-3">Account</h2>
					<p className="text-small text-text-tertiary mb-3">
						Fields marked <span className="text-coral">*</span> are required.
					</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<Field id="email" label="Company email (login)" required>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</Field>
						<Field id="invite_email" label="Personal email (invite sent here)">
							<Input
								id="invite_email"
								type="email"
								placeholder="e.g. jane@gmail.com — defaults to the company email"
								value={personalEmail}
								onChange={(e) => setPersonalEmail(e.target.value)}
							/>
						</Field>
						<Field id="role" label="Role" required>
							<select
								id="role"
								className={SELECT_CLASS}
								value={roleCode}
								onChange={(e) => setRoleCode(e.target.value)}
							>
								{roles.map((r) => (
									<option key={r.code} value={r.code}>
										{r.name}
									</option>
								))}
							</select>
						</Field>
						<Field id="credential_method" label="Credential method" required>
							<select
								id="credential_method"
								className={SELECT_CLASS}
								value={credentialMethod}
								onChange={(e) => setCredentialMethod(e.target.value as "invite" | "temp")}
							>
								<option value="invite">Send email invite</option>
								<option value="temp">Set temporary password</option>
							</select>
						</Field>
						{credentialMethod === "temp" && (
							<Field id="temp_password" label="Temporary password" required>
								<Input
									id="temp_password"
									type="text"
									value={tempPassword}
									onChange={(e) => setTempPassword(e.target.value)}
								/>
							</Field>
						)}
					</div>
				</section>

				<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
					<header className="flex items-center justify-between mb-3">
						<h2 className="text-h3 text-text-primary">Also create an employee record</h2>
						<Switch
							aria-label="Also create an employee record"
							checked={alsoCreateEmployee}
							onCheckedChange={(v) => {
								setAlsoCreateEmployee(v);
								if (v && !employeeEmail) setEmployeeEmail(email);
							}}
						/>
					</header>
					{alsoCreateEmployee && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<Field id="employee_code" label="Employee code" required>
								<EmployeeCodeField value={employeeCode} onChange={setEmployeeCode} mode="create" />
							</Field>
							<Field id="first_name" label="First name" required>
								<Input
									id="first_name"
									value={firstName}
									onChange={(e) => setFirstName(e.target.value)}
								/>
							</Field>
							<Field id="last_name" label="Last name" required>
								<Input
									id="last_name"
									value={lastName}
									onChange={(e) => setLastName(e.target.value)}
								/>
							</Field>
							<Field id="employee_email" label="Employee email">
								<Input
									id="employee_email"
									type="email"
									value={employeeEmail}
									onChange={(e) => setEmployeeEmail(e.target.value)}
								/>
							</Field>
							<Field id="hire_date" label="Hire date" required>
								<Input
									id="hire_date"
									type="date"
									value={hireDate}
									onChange={(e) => setHireDate(e.target.value)}
								/>
							</Field>
							<Field id="department" label="Department" required>
								<select
									id="department"
									className={SELECT_CLASS}
									value={department}
									onChange={(e) => setDepartment(e.target.value)}
								>
									<option value="">—</option>
									{departments.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</Field>
							<Field id="employment_type" label="Employment type" required>
								<select
									id="employment_type"
									className={SELECT_CLASS}
									value={employmentType}
									onChange={(e) => setEmploymentType(e.target.value)}
								>
									{EMPLOYMENT_TYPES.map((t) => (
										<option key={t.value} value={t.value}>
											{t.label}
										</option>
									))}
								</select>
							</Field>
						</div>
					)}
				</section>

				<div className="flex items-center justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						onClick={() => navigate("/admin/settings/users")}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={saving}>
						{saving ? "Creating…" : "Create user"}
					</Button>
				</div>
			</form>
		</div>
	);
}

function Field({
	id,
	label,
	required,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-label uppercase text-text-tertiary">
				{label}
				{required && <span className="text-coral"> *</span>}
			</label>
			{children}
		</div>
	);
}
