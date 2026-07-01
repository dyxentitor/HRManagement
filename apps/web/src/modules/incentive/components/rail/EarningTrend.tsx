import { TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

import type { MeTrend } from "../../api";
import { md } from "../format";

/** Private personal trend — approved mandays per quarter, last 4. CSS bars, no peer comparison. */
export function EarningTrend({ trend }: { trend: MeTrend[] }) {
	const max = Math.max(1, ...trend.map((t) => Number(t.mandays)));
	const hasAny = trend.some((t) => Number(t.mandays) > 0);

	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-1 flex items-center gap-1.5">
				<TrendingUp className="size-4 text-accent-200" aria-hidden /> My earning trend
			</h3>
			<p className="text-[11px] text-text-tertiary mb-3">Approved mandays · last 4 quarters</p>
			{!hasAny ? (
				<p className="text-small text-text-tertiary py-3">No approved mandays yet.</p>
			) : (
				<div className="flex items-end gap-3 h-24 px-1">
					{trend.map((t, i) => {
						const h = (Number(t.mandays) / max) * 100;
						const last = i === trend.length - 1;
						return (
							<div key={t.quarter} className="flex-1 text-center flex flex-col justify-end">
								<div
									className={cn(
										"w-full rounded-t-md bg-gradient-to-b",
										last ? "from-accent-500 to-accent-500/20" : "from-lavender to-lavender/20",
									)}
									style={{ height: `${Math.max(4, h)}%` }}
								/>
								<p className={cn("text-[10px] mt-1.5", last ? "text-accent-200" : "text-text-tertiary")}>
									{t.quarter.split("-")[1]} · {md(t.mandays)}
								</p>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
