import { StatusPill } from "@/components/hrms";

type Props = { data: Record<string, unknown> };

export function PendingApprovalsCard({ data }: Props) {
	const count = (data.count as number) ?? 0;
	const items = (data.items as Array<Record<string, unknown>>) ?? [];
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Pending Approvals
			</h3>
			<p className="text-h1 text-peach font-bold leading-none mb-3">{count}</p>
			{items.length > 0 && (
				<ul className="space-y-2">
					{items.slice(0, 3).map((item) => (
						<li
							key={item.id as string}
							className="text-small flex items-center gap-2"
						>
							<StatusPill
								tone="yellow"
								label={(item.kind as string) ?? "request"}
							/>
							<span className="text-text-secondary truncate">
								{item.employee_code as string}: {item.summary as string}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
