import { useEffect, useState } from "react";

import { employeeApi } from "../api";

interface EmployeeProfile {
	employee_code: string;
	full_name: string;
	email: string;
	phone: string;
	alt_phone: string;
	preferred_name: string;
	role_title: string;
	employment_type: string;
	hire_date: string;
	status: string;
	department: string;
	bank_name: string;
	bank_account_last4: string;
	ic_last4: string;
	emergency_contact_name: string;
	emergency_contact_phone: string;
	emergency_contact_relationship: string;
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

	if (loading) return <p>Loading...</p>;
	if (error)
		return (
			<p role="alert" className="text-red-600">
				{error}
			</p>
		);
	if (!profile) return <p>No profile linked to this user.</p>;

	return (
		<div className="space-y-4 max-w-3xl">
			<h1 className="text-2xl font-bold">My Profile</h1>

			<Section title="Identity">
				<Row label="Name" value={profile.full_name} />
				<Row label="Code" value={profile.employee_code} />
				<Row label="Email" value={profile.email} />
				<Row label="Phone" value={profile.phone} />
			</Section>

			<Section title="Employment">
				<Row label="Role" value={profile.role_title} />
				<Row label="Type" value={profile.employment_type} />
				<Row label="Status" value={profile.status} />
				<Row label="Hire date" value={profile.hire_date} />
			</Section>

			<Section title="Sensitive (read-only here)">
				<Row label="IC last 4" value={profile.ic_last4 || "—"} />
				<Row label="Bank" value={profile.bank_name || "—"} />
				<Row label="Bank last 4" value={profile.bank_account_last4 || "—"} />
			</Section>

			<Section title="Emergency contact">
				<Row label="Name" value={profile.emergency_contact_name} />
				<Row
					label="Relationship"
					value={profile.emergency_contact_relationship}
				/>
				<Row label="Phone" value={profile.emergency_contact_phone} />
			</Section>
		</div>
	);
}

function Section({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<section className="border rounded p-4 bg-white">
			<h2 className="font-semibold mb-3">{title}</h2>
			<dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">{children}</dl>
		</section>
	);
}

function Row({
	label,
	value,
}: { label: string; value: string | null | undefined }) {
	return (
		<>
			<dt className="text-slate-500">{label}</dt>
			<dd>{value || "—"}</dd>
		</>
	);
}
