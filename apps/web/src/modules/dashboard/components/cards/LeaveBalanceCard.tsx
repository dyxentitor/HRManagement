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
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				Leave Balance {data.year as number}
			</h3>
			{balances.length === 0 ? (
				<p className="text-xs text-slate-500">No balance data.</p>
			) : (
				<ul className="space-y-1">
					{balances.map((b) => (
						<li key={b.code} className="text-xs flex justify-between">
							<span className="font-medium">{b.code}</span>
							<span className="text-slate-600">
								{b.available} / {b.entitled}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
