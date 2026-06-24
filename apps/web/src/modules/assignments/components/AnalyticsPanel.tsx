import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { type Analytics, assignmentsApi } from "../api";

export function AnalyticsPanel() {
	const [data, setData] = useState<Analytics | null>(null);

	useEffect(() => {
		assignmentsApi
			.analytics()
			.then(setData)
			.catch(() => setData(null));
	}, []);

	if (data === null) return <Skeleton className="h-40 rounded-2xl" />;

	const { totals } = data;
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<Stat label="Completion" value={`${totals.completion_rate}%`} tone="text-mint" />
				<Stat label="Completed" value={totals.completed} tone="text-mint" />
				<Stat label="Pending" value={totals.pending} tone="text-yellow" />
				<Stat label="Overdue" value={totals.overdue} tone="text-coral" />
			</div>

			<section className="glass-surface rounded-2xl p-4">
				<p className="layer-eyebrow mb-3">By department</p>
				{data.by_department.length === 0 ? (
					<p className="text-small text-text-tertiary">No data yet.</p>
				) : (
					<ul className="space-y-2">
						{data.by_department.map((d) => {
							const rate = d.total ? Math.round((d.completed / d.total) * 100) : 0;
							return (
								<li key={d.department} className="space-y-1">
									<div className="flex justify-between text-small">
										<span className="text-text-secondary">{d.department}</span>
										<span className="text-text-tertiary tabular-nums">
											{d.completed}/{d.total}
											{d.overdue > 0 && <span className="text-coral"> · {d.overdue} overdue</span>}
										</span>
									</div>
									<div className="h-1.5 rounded-full bg-surface-elevated/60 overflow-hidden">
										<div className="h-full bg-accent-500" style={{ width: `${rate}%` }} />
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
	return (
		<div className="glass-surface rounded-2xl p-4">
			<p className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</p>
			<p className={`text-h2 ${tone} tabular-nums`}>{value}</p>
		</div>
	);
}
