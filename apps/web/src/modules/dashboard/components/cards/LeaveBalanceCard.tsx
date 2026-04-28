import { ProgressBar } from "@/components/hrms";

type Balance = {
	code: string;
	available: string;
	entitled: string;
	taken: string;
};
type Props = { data: Record<string, unknown> };

export function LeaveBalanceCard({ data }: Props) {
	const balances = (data.balances as Balance[]) ?? [];
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Leave Balance {data.year as number}
			</h3>
			{balances.length === 0 ? (
				<p className="text-small text-text-tertiary">No balance data.</p>
			) : (
				<ul className="space-y-3">
					{balances.map((b) => {
						const entitled = Number.parseFloat(b.entitled) || 0;
						const available = Number.parseFloat(b.available) || 0;
						return (
							<li key={b.code}>
								<div className="flex justify-between text-small mb-1">
									<span className="text-text-primary font-medium">
										{b.code}
									</span>
									<span className="text-text-tertiary">
										{b.available} / {b.entitled}
									</span>
								</div>
								{entitled > 0 && (
									<ProgressBar
										value={available}
										max={entitled}
										showValue={false}
										gradient={["peach", "coral"]}
									/>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
