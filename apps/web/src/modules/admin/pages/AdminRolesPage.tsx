import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { DataTable } from "@/components/hrms/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { type RoleSummary, roleApi } from "../api";

export default function AdminRolesPage() {
	const [rows, setRows] = useState<RoleSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		roleApi
			.list()
			.then((rs) => setRows(rs))
			.catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"))
			.finally(() => setLoading(false));
	}, []);

	return (
		<div className="space-y-4">
			<PageHeader
				title="Roles"
				subtitle="Manage permissions for each role. 7 system roles."
			/>
			{err && <div className="text-error text-small">{err}</div>}
			{loading ? (
				<p className="text-text-tertiary text-small">Loading…</p>
			) : (
				<DataTable
					rows={rows}
					rowKey={(r) => r.code}
					columns={[
						{
							key: "name",
							header: "Name",
							render: (r) => (
								<Link
									to={`/admin/roles/${r.code}`}
									className="text-accent-300 hover:underline"
								>
									{r.name}
								</Link>
							),
						},
						{
							key: "code",
							header: "Code",
							render: (r) => (
								<code className="text-text-tertiary">{r.code}</code>
							),
						},
						{
							key: "members",
							header: "Members",
							render: (r) => <span>{r.member_count}</span>,
						},
					]}
					emptyState={<p className="text-text-tertiary">No roles defined.</p>}
				/>
			)}
		</div>
	);
}
