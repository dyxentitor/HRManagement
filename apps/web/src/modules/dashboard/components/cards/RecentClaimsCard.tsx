import { StatusPill } from "@/components/hrms";

type Claim = {
	id: string;
	category: string;
	amount: string;
	currency: string;
	status: string;
	expense_date: string;
};

type StatusTone = "mint" | "yellow" | "coral" | "lavender" | "peach" | "sky";

function statusTone(status: string): StatusTone {
	switch (status.toLowerCase()) {
		case "approved":
			return "mint";
		case "rejected":
			return "coral";
		case "pending":
			return "yellow";
		default:
			return "lavender";
	}
}

type Props = { data: Record<string, unknown> };

export function RecentClaimsCard({ data }: Props) {
	const claims = (data.claims as Claim[]) ?? [];
	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				My Recent Claims
			</h3>
			{claims.length === 0 ? (
				<p className="text-small text-text-tertiary">No recent claims.</p>
			) : (
				<ul className="space-y-2">
					{claims.map((c) => (
						<li
							key={c.id}
							className="text-small flex justify-between items-center gap-2"
						>
							<div className="min-w-0">
								<span className="text-text-primary">{c.category}</span>
								<span className="text-text-tertiary ml-1">
									{c.currency} {c.amount}
								</span>
							</div>
							<StatusPill tone={statusTone(c.status)} label={c.status} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
