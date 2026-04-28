import { ProgressBar } from "@/components/hrms";

type Props = { data: Record<string, unknown> };

export function KpiProgressCard({ data }: Props) {
	const cycle = data.cycle as string | null;
	const total = (data.total as number) ?? 0;
	const completed = (data.completed as number) ?? 0;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Team KPI Cycle
			</h3>
			{cycle == null ? (
				<p className="text-small text-text-tertiary">No active KPI cycle.</p>
			) : (
				<>
					<p className="text-small text-text-secondary mb-3">{cycle}</p>
					<ProgressBar
						value={completed}
						max={total || 1}
						label={`${completed}/${total} completed`}
						gradient={["lavender", "mint"]}
					/>
					<p className="text-small text-text-tertiary mt-2">{pct}% complete</p>
				</>
			)}
		</div>
	);
}
