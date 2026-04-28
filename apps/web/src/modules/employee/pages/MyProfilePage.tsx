import { useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils";

import { employeeApi } from "../api";

interface EmployeeProfile {
	employee_code: string;
	full_name: string;
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
	emergency_contact_name?: string;
	emergency_contact_phone?: string;
	emergency_contact_relationship?: string;
}

interface Field {
	k: string;
	v: React.ReactNode;
	mono?: boolean;
}

function Section({
	title,
	fields,
	flagged,
	flagLabel,
}: {
	title: string;
	fields: Field[];
	flagged?: boolean;
	flagLabel?: string;
}) {
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
				<button
					type="button"
					className="text-small text-accent-200 hover:text-accent-50"
				>
					Edit
				</button>
			</header>
			<dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-body">
				{fields.map((f) => (
					<div key={f.k}>
						<dt className="text-label uppercase text-text-tertiary">{f.k}</dt>
						<dd
							className={cn(
								"text-text-primary mt-0.5",
								f.mono && "font-mono text-small",
							)}
						>
							{f.v}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

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

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const data = await employeeApi.getMe();
				if (!cancelled) setProfile(data as unknown as EmployeeProfile);
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

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
				<div className="bg-surface-hover border border-dashed border-border-subtle rounded-lg p-8 text-center text-text-tertiary">
					<div className="text-h2 mb-2">👤</div>
					<h2 className="text-h3 text-text-primary">
						No employee record linked
					</h2>
					<p className="text-body mt-1">
						Your account isn't linked to an employee yet. Ask HR to create your
						employee record before you can manage personal details, banking, or
						emergency contacts here.
					</p>
				</div>
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
					<div
						className="size-20 rounded-full bg-gradient-to-br from-lavender to-mint mx-auto mb-2 border-2 border-accent-500/30"
						aria-hidden
					/>
					<h2 className="text-h2 text-text-primary">{profile.full_name}</h2>
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
						{profile.employment_type && (
							<div className="flex justify-between border-t border-border-subtle pt-1.5">
								<dt className="text-text-tertiary">Type</dt>
								<dd className="text-text-primary">{profile.employment_type}</dd>
							</div>
						)}
					</dl>
				</aside>

				<div className="space-y-3">
					<Section
						title="Personal"
						fields={[
							{ k: "Phone", v: profile.phone || "—" },
							{ k: "Alt phone", v: profile.alt_phone || "—" },
							{ k: "Email", v: profile.email },
							{
								k: "Preferred name",
								v: profile.preferred_name || profile.full_name,
							},
							{
								k: "IC",
								v: profile.ic_last4 ? `•••• ${profile.ic_last4}` : "—",
								mono: true,
							},
						]}
					/>

					<Section
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

					<Section
						title="Banking"
						flagged
						flagLabel="MFA required"
						fields={[
							{ k: "Bank", v: profile.bank_name || "—" },
							{
								k: "Account",
								v: profile.bank_account_last4
									? `•••• ${profile.bank_account_last4}`
									: "—",
								mono: true,
							},
						]}
					/>

					{profile.emergency_contact_name && (
						<Section
							title="Emergency contact"
							fields={[
								{ k: "Name", v: profile.emergency_contact_name },
								{ k: "Phone", v: profile.emergency_contact_phone || "—" },
								{
									k: "Relationship",
									v: profile.emergency_contact_relationship || "—",
								},
							]}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
