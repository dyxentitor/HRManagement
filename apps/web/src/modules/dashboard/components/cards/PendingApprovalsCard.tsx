type Props = { data: Record<string, unknown> };

export function PendingApprovalsCard({ data }: Props) {
	const count = data.count as number;
	const items = (data.items as Array<Record<string, unknown>>) ?? [];
	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Pending Approvals
			</h3>
			<p className="text-3xl font-bold text-amber-600">{count}</p>
			{items.length > 0 && (
				<ul className="mt-2 space-y-1">
					{items.slice(0, 3).map((item) => (
						<li
							key={item.id as string}
							className="text-xs text-slate-600 truncate"
						>
							<span className="capitalize">{item.kind as string}</span> —{" "}
							{item.employee_code as string}: {item.summary as string}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
