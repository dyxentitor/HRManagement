import { cn } from "@/lib/utils";
import type { LeaveBalance } from "../api";
import {
	TONE_BG,
	TONE_ICON_BG,
	availableDays,
	num,
	overdrawnBy,
	typeIcon,
	typeTone,
} from "../lib/leave-ui";

/** Per-type balance tiles (glow), in the dashboard's tile language. */
export function LeaveBalanceTiles({
	balances,
	onSelect,
}: {
	balances: LeaveBalance[];
	onSelect: (b: LeaveBalance) => void;
}) {
	// top types by entitlement, capped at 4 for a clean row
	const tiles = [...balances].sort((a, b) => num(b.entitled) - num(a.entitled)).slice(0, 4);

	if (tiles.length === 0) return null;

	return (
		<section>
			<p className="layer-eyebrow mb-2">Your balances</p>
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
				{tiles.map((b) => {
					const tone = typeTone(b.leave_type_code);
					const Icon = typeIcon(b.leave_type_code);
					return (
						<button
							type="button"
							key={b.id}
							onClick={() => onSelect(b)}
							className="group relative overflow-hidden rounded-xl p-4 border border-border-subtle bg-surface-hover min-h-[112px] flex flex-col gap-2 text-left transition-transform duration-fast hover:-translate-y-1 focus-visible:-translate-y-1"
						>
							<span
								className={cn(
									"absolute -top-7 -right-7 size-20 rounded-full blur-2xl opacity-40",
									TONE_BG[tone],
								)}
								aria-hidden
							/>
							<div className="relative z-10 flex items-center justify-between">
								<span
									className={cn("size-9 rounded-xl grid place-items-center", TONE_ICON_BG[tone])}
									aria-hidden
								>
									<Icon className="size-4.5" />
								</span>
								<span className="text-[30px] font-extralight leading-none tabular-nums tracking-tight">
									{availableDays(b.available)}
								</span>
							</div>
							<p className="relative z-10 text-small text-text-secondary leading-tight mt-auto">
								{b.leave_type_name ?? b.leave_type_code}
							</p>
							{overdrawnBy(b.available) > 0 ? (
								<p className="relative z-10 text-[10px] text-coral tabular-nums">
									over by {overdrawnBy(b.available)} days
								</p>
							) : (
								<p className="relative z-10 text-[10px] text-text-tertiary tabular-nums">
									of {num(b.entitled)} days
								</p>
							)}
						</button>
					);
				})}
			</div>
		</section>
	);
}
