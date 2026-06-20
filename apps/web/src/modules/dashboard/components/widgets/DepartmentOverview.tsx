import type { DepartmentOverviewData } from "../../api";
import { WidgetCard } from "./WidgetCard";

export function DepartmentOverview({
	data,
}: {
	data: DepartmentOverviewData;
}) {
	const departments = [...(data.departments ?? [])].sort(
		(a, b) => b.count - a.count,
	);
	const max = Math.max(1, ...departments.map((d) => d.count));
	return (
		<WidgetCard title="Department overview">
			{departments.length === 0 ? (
				<p className="text-small text-text-tertiary">No departments.</p>
			) : (
				<ul className="space-y-2.5">
					{departments.map((d) => (
						<li key={d.name}>
							<div className="flex items-center justify-between text-small mb-1">
								<span className="text-text-secondary truncate">{d.name}</span>
								<span className="text-text-tertiary tabular-nums">{d.count}</span>
							</div>
							<div className="h-1.5 bg-border-subtle/40 rounded-full overflow-hidden">
								<div
									className="h-full rounded-full bg-gradient-to-r from-accent-500 to-lavender"
									style={{ width: `${(d.count / max) * 100}%` }}
								/>
							</div>
						</li>
					))}
				</ul>
			)}
		</WidgetCard>
	);
}
