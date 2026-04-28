type Claim = {
	id: string;
	category: string;
	amount: string;
	currency: string;
	status: string;
	expense_date: string;
};
type Props = { data: Record<string, unknown> };

export function RecentClaimsCard({ data }: Props) {
	const claims = (data.claims as Claim[]) ?? [];
	return (
		<div className="bg-white border rounded p-4">
			<h3 className="font-semibold text-sm text-slate-700 mb-2">
				My Recent Claims
			</h3>
			{claims.length === 0 ? (
				<p className="text-xs text-slate-500">No recent claims.</p>
			) : (
				<ul className="space-y-1">
					{claims.map((c) => (
						<li key={c.id} className="text-xs flex justify-between">
							<span>
								{c.category} — {c.currency} {c.amount}
							</span>
							<span className="text-slate-500 capitalize">{c.status}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
