import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";
import { RolesCard } from "@/modules/admin/components/RolesCard";
import { LeaveBalanceCard } from "../components/LeaveBalanceCard";
import { tenureFromHireDate } from "../lib/format";

import { type Employee, type ReportingChainEntry, employeeApi } from "../api";
import { ProfileCompletenessBanner } from "../components/ProfileCompletenessBanner";

function ArchiveButton({ employee }: { employee: Employee }) {
	const [armed, setArmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const navigate = useNavigate();

	if (busy) {
		return <span className="text-small text-text-tertiary">Archiving…</span>;
	}

	if (!armed) {
		return (
			<button
				type="button"
				onClick={() => setArmed(true)}
				className="text-small px-3 py-1 rounded border border-coral text-coral hover:bg-coral/10"
			>
				Archive
			</button>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-small text-coral">Archive {employee.full_name}?</span>
			<button
				type="button"
				onClick={async () => {
					setBusy(true);
					try {
						await employeeApi.archive(employee.id);
						navigate("/employees");
					} finally {
						setBusy(false);
					}
				}}
				className="text-small px-2 py-0.5 rounded bg-coral text-white"
			>
				Confirm
			</button>
			<button
				type="button"
				onClick={() => setArmed(false)}
				className="text-small text-text-secondary"
			>
				Cancel
			</button>
		</div>
	);
}

interface Field {
	k: string;
	v: React.ReactNode;
	mono?: boolean;
}

function Section({ title, fields }: { title: string; fields: Field[] }) {
	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h2 className="text-h3 text-text-primary mb-3">{title}</h2>
			<dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-body">
				{fields.map((f) => (
					<div key={f.k}>
						<dt className="text-label uppercase text-text-tertiary">{f.k}</dt>
						<dd className={cn("text-text-primary mt-0.5", f.mono && "font-mono text-small")}>
							{f.v}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

export default function EmployeeDetailPage() {
	const { id } = useParams<{ id: string }>();
	const canReadOrg = useCan("employee:read:org");
	const canEdit = useCan("employee:write:org");
	const canArchive = useCan("employee:archive");
	const canViewLeave = useCan("leave:balance:read:org");

	const [employee, setEmployee] = useState<Employee | null>(null);
	const [chain, setChain] = useState<ReportingChainEntry[]>([]);
	const [reports, setReports] = useState<Employee[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!id) return;

		let cancelled = false;
		setLoading(true);
		setError(null);

		Promise.all([
			employeeApi.retrieve(id),
			canReadOrg ? employeeApi.getReportingChain(id) : Promise.resolve([]),
			canReadOrg ? employeeApi.getDirectReports(id) : Promise.resolve([]),
		])
			.then(([emp, reportingChain, directReports]) => {
				if (cancelled) return;
				if (!emp) {
					setError("Employee not found");
				} else {
					setEmployee(emp);
					setChain(reportingChain);
					setReports(directReports);
				}
				setLoading(false);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Could not load employee");
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [id, canReadOrg]);

	if (loading) return <p className="text-text-tertiary">Loading…</p>;
	if (error)
		return (
			<p role="alert" className="text-coral">
				{error}
			</p>
		);
	if (!employee) return null;

	const tenure = tenureFromHireDate(employee.hire_date);
	const joined = employee.hire_date
		? new Date(employee.hire_date).toLocaleDateString("en-MY", {
				month: "short",
				year: "numeric",
			})
		: "—";

	return (
		<div className="space-y-6">
			<PageHeader
				breadcrumb="Employees"
				title={employee.full_name}
				actions={
					<div className="flex items-center gap-2">
						<a href="/employees" className="text-small text-accent-200 hover:text-accent-50">
							← All employees
						</a>
						{canEdit && (
							<a
								href={`/employees/${employee.id}/edit`}
								className="text-small px-3 py-1 rounded bg-accent-500 text-white hover:bg-accent-600"
							>
								Edit
							</a>
						)}
						{canArchive && <ArchiveButton employee={employee} />}
					</div>
				}
			/>

			<ProfileCompletenessBanner employee={employee} />

			<div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
				{/* Avatar card */}
				<aside className="bg-surface-hover border border-border-subtle rounded-lg p-5 text-center">
					{employee.photo_url ? (
						<img
							src={employee.photo_url}
							alt={`${employee.full_name} avatar`}
							className="size-20 rounded-full object-cover mx-auto mb-2 border-2 border-accent-500/30"
						/>
					) : (
						<div
							className="size-20 rounded-full bg-gradient-to-br from-lavender to-mint mx-auto mb-2 border-2 border-accent-500/30"
							aria-hidden
						/>
					)}
					<h2 className="text-h2 text-text-primary">{employee.full_name}</h2>
					{employee.role_title && (
						<p className="text-small text-accent-200 inline-block bg-accent-500/15 rounded-full px-2.5 py-0.5 mt-1">
							{employee.role_title}
							{employee.department_name ? ` · ${employee.department_name}` : ""}
						</p>
					)}
					{employee.status && (
						<div className="mt-2">
							<StatusPill
								tone={employee.status === "active" ? "mint" : "coral"}
								label={employee.status}
							/>
						</div>
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
						{employee.employment_type && (
							<div className="flex justify-between border-t border-border-subtle pt-1.5">
								<dt className="text-text-tertiary">Type</dt>
								<dd className="text-text-primary">{employee.employment_type}</dd>
							</div>
						)}
					</dl>
				</aside>

				<div className="space-y-3">
					{/* Employment */}
					<Section
						title="Employment"
						fields={[
							{ k: "Code", v: employee.employee_code ?? "—", mono: true },
							{ k: "Type", v: employee.employment_type ?? "—" },
							{ k: "Department", v: employee.department_name ?? "—" },
							{ k: "Role", v: employee.role_title ?? "—" },
							{ k: "Hire date", v: employee.hire_date ?? "—" },
							{ k: "Status", v: employee.status ?? "—" },
						]}
					/>

					{/* Personal — only shown to users with org-level read */}
					{canReadOrg && (
						<Section
							title="Personal"
							fields={[
								{ k: "Email", v: employee.email ?? "—" },
								{ k: "Phone", v: employee.phone ?? "—" },
								{
									k: "IC",
									v: employee.ic_last4 ? `•••• ${employee.ic_last4}` : "—",
									mono: true,
								},
								{
									k: "Date of birth",
									v: employee.date_of_birth ?? "—",
								},
								{
									k: "Address",
									v: employee.address_line1
										? `${employee.address_line1}, ${employee.city ?? ""}`
										: "—",
								},
							]}
						/>
					)}

					{/* Roles — only shown when the employee is linked to an auth user */}
					{employee.user_id && (
						<RolesCard
							userId={employee.user_id}
							currentRoles={employee.user_roles ?? []}
							onChange={(roles) =>
								setEmployee((prev) => (prev ? { ...prev, user_roles: roles } : prev))
							}
						/>
					)}

					{/* Leave & holidays — read-only; Admin/HR only on the directory page */}
					{canViewLeave && <LeaveBalanceCard employeeId={employee.id} />}

					{/* Reporting chain */}
					{chain.length > 0 && (
						<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
							<h2 className="text-h3 text-text-primary mb-3">Reporting chain</h2>
							<ol className="space-y-2">
								{chain.map((entry) => (
									<li key={entry.id} className="flex items-center gap-2 text-body">
										<span className="text-label text-text-tertiary w-5 text-right shrink-0">
											L{entry.level}
										</span>
										<a
											href={`/employees/${entry.id}`}
											className="text-accent-200 hover:text-accent-50"
										>
											{entry.full_name}
										</a>
										{entry.role_title && (
											<span className="text-small text-text-tertiary">· {entry.role_title}</span>
										)}
									</li>
								))}
							</ol>
						</section>
					)}

					{/* Direct reports */}
					{reports.length > 0 && (
						<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
							<h2 className="text-h3 text-text-primary mb-3">Direct reports ({reports.length})</h2>
							<ul className="space-y-2">
								{reports.map((r) => (
									<li key={r.id} className="flex items-center gap-2 text-body">
										<a href={`/employees/${r.id}`} className="text-accent-200 hover:text-accent-50">
											{r.full_name}
										</a>
										{r.role_title && (
											<span className="text-small text-text-tertiary">· {r.role_title}</span>
										)}
									</li>
								))}
							</ul>
						</section>
					)}
				</div>
			</div>
		</div>
	);
}
