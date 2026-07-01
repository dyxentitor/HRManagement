import { cn } from "@/lib/utils";

import type { MeClaimCounts, MeEarnings } from "../api";
import { md, rm } from "./format";

export function MandayKpis({
	earnings,
	counts,
}: {
	earnings: MeEarnings;
	counts: MeClaimCounts;
}) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
			<Kpi
				dot="bg-mint"
				label="Earned · approved"
				value={md(earnings.earned_mandays)}
				sub="net of reversals · mandays"
			/>
			<Kpi
				dot="bg-yellow"
				label="Pending review"
				value={md(earnings.pending_mandays)}
				sub={`${counts.pending} claim${counts.pending === 1 ? "" : "s"} awaiting a manager`}
			/>
			<Kpi
				dot="bg-lavender"
				label="This quarter"
				value={md(earnings.this_quarter_mandays)}
				sub={`≈ ${rm(earnings.this_quarter_rm)}`}
			/>
			<Kpi
				dot="bg-sky"
				label="Paid out"
				value={rm(earnings.paid_rm)}
				sub={`${md(earnings.paid_mandays)} md settled`}
			/>
		</div>
	);
}

function Kpi({
	dot,
	label,
	value,
	sub,
}: {
	dot: string;
	label: string;
	value: string;
	sub: string;
}) {
	return (
		<div className="glass-surface rounded-2xl p-3.5">
			<div className="flex items-center gap-2">
				<span className={cn("size-1.5 rounded-full", dot)} />
				<p className="text-label text-text-tertiary">{label}</p>
			</div>
			<p className="text-2xl font-bold tracking-tight mt-2 tabular-nums">{value}</p>
			<p className="text-[10px] text-text-tertiary mt-1.5">{sub}</p>
		</div>
	);
}
