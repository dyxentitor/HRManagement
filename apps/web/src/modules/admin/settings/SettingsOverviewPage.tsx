import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/shell/PageHeader";

import { type SettingsOverview, settingsApi } from "./settings-api";

export default function SettingsOverviewPage() {
	const [data, setData] = useState<SettingsOverview | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		settingsApi
			.overview()
			.then(setData)
			.catch((e: Error) => setError(e.message));
	}, []);

	if (error) {
		return <div className="text-coral">Failed to load overview: {error}</div>;
	}
	if (!data) {
		return <div className="text-text-secondary">Loading overview…</div>;
	}

	const { stats, attention, recent_activity } = data;
	const unlinkedCount = attention.unlinked_users_count;

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Overview"
				subtitle="Health of your HRMS configuration at a glance."
			/>

			{unlinkedCount > 0 && (
				<div className="flex items-center gap-3 p-3 rounded-lg border border-coral/30 bg-coral/10">
					<AlertTriangle className="w-5 h-5 text-coral shrink-0" />
					<div className="flex-1">
						<div className="font-semibold text-text-primary">
							{unlinkedCount} user{unlinkedCount === 1 ? "" : "s"} not linked to
							an employee record
						</div>
						<div className="text-small text-text-secondary">
							They'll see "Ask HR to create your employee record" on their
							dashboard.
						</div>
					</div>
					<Link
						to="/admin/settings/users"
						className="px-3 py-1.5 bg-coral text-white rounded text-small font-semibold whitespace-nowrap"
					>
						Review &amp; link →
					</Link>
				</div>
			)}

			<div className="grid grid-cols-4 gap-3">
				<StatTile
					label="Employees"
					value={stats.employees_active}
					meta={`${stats.employees_archived} archived`}
				/>
				<StatTile label="Departments" value={stats.departments} meta="" />
				<StatTile
					label="Modules"
					value={`${stats.modules_enabled}/${stats.modules_total}`}
					meta={`${stats.modules_total - stats.modules_enabled} disabled`}
				/>
				<StatTile
					label="Roles"
					value={stats.roles}
					meta={`${stats.perm_codes} perm codes`}
				/>
			</div>

			<section>
				<h3 className="text-label uppercase text-text-tertiary mb-2">
					Recent admin activity
				</h3>
				<div className="rounded-lg border border-border-subtle bg-surface overflow-hidden">
					{recent_activity.length === 0 ? (
						<div className="p-4 text-small text-text-tertiary">
							No recent activity.
						</div>
					) : (
						recent_activity.map((a) => (
							<div
								key={`${a.action}-${a.occurred_at}`}
								className="flex items-center gap-3 p-3 border-b border-border-subtle last:border-b-0"
							>
								<div className="flex-1 text-body text-text-primary">
									{a.summary}
								</div>
								<div className="text-small text-text-tertiary font-mono">
									{new Date(a.occurred_at).toLocaleDateString()}
								</div>
							</div>
						))
					)}
				</div>
			</section>
		</div>
	);
}

function StatTile({
	label,
	value,
	meta,
}: {
	label: string;
	value: number | string;
	meta: string;
}) {
	return (
		<div className="rounded-lg border border-border-subtle bg-surface p-3">
			<div className="text-label uppercase text-text-tertiary mb-1">
				{label}
			</div>
			<div className="text-h2 font-bold font-mono text-text-primary">
				{value}
			</div>
			{meta && (
				<div className="text-small text-text-secondary mt-1">{meta}</div>
			)}
		</div>
	);
}
