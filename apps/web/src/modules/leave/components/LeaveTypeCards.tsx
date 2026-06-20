import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { LeaveBalance, LeaveType } from "../api";
import { TONE_ICON_BG, num, typeCopy, typeIcon, typeTone } from "../lib/leave-ui";

/** Large glass feature cards per leave type, with balance + Apply launch. */
export function LeaveTypeCards({
	types,
	balances,
}: {
	types: LeaveType[];
	balances: LeaveBalance[];
}) {
	if (types.length === 0) return null;
	return (
		<section>
			<p className="layer-eyebrow mb-3">Take leave</p>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
				{types.map((t) => {
					const tone = typeTone(t.code);
					const Icon = typeIcon(t.code);
					const bal = balances.find((b) => b.leave_type_code === t.code);
					return (
						<Link
							key={t.id}
							to={`/leave/apply?type=${t.id}`}
							className="group glass-surface rounded-2xl p-5 flex flex-col gap-3 transition-transform duration-fast hover:-translate-y-1 focus-visible:-translate-y-1"
						>
							<span
								className={cn("size-11 rounded-2xl grid place-items-center", TONE_ICON_BG[tone])}
								aria-hidden
							>
								<Icon className="size-5" />
							</span>
							<h3 className="text-h3 text-text-primary">{t.name}</h3>
							<p className="text-small text-text-tertiary leading-relaxed flex-1">
								{typeCopy(t.code)}
							</p>
							<div className="flex items-center justify-between">
								<span className="text-small text-accent-200 inline-flex items-center gap-1 group-hover:gap-2 transition-all duration-fast">
									Apply <ArrowRight className="size-3.5" />
								</span>
								{bal && (
									<span className="text-[11px] text-text-tertiary tabular-nums">
										{num(bal.available)} of {num(bal.entitled)} left
									</span>
								)}
							</div>
						</Link>
					);
				})}
			</div>
		</section>
	);
}
