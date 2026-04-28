type Props = { data: Record<string, unknown> };

export function KpiProgressCard({ data }: Props) {
	const cycle = data.cycle as string | null;
	const total = (data.total as number) ?? 0;
	const completed = (data.completed as number) ?? 0;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Team KPI Cycle
			</h3>
			{cycle == null ? (
				<p className="text-xs text-slate-500">No active KPI cycle.</p>
			) : (
				<>
					<p className="text-xs text-slate-600 mb-1">{cycle}</p>
					<div className="h-2 bg-slate-100 rounded">
						<div
							className="h-2 bg-green-500 rounded"
							style={{ width: `${pct}%` }}
						/>
					</div>
					<p className="text-xs text-slate-500 mt-1">
						{completed}/{total} completed ({pct}%)
					</p>
				</>
			)}
		</div>
	);
}
