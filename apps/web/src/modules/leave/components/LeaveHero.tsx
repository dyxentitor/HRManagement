import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { DonutChart, type DonutSegment, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import type { LeaveBalance } from "../api";
import { daysUntil } from "../lib/leave-dates";
import { typeTone } from "../lib/leave-ui";

function num(s: string | undefined): number {
	return Number(s ?? 0);
}

export interface LeaveHeroProps {
	balances: LeaveBalance[];
	primaryCode: string;
	onSelectType: (code: string) => void;
}

export function LeaveHero({ balances, primaryCode, onSelectType }: LeaveHeroProps) {
	const primary =
		balances.find((b) => b.leave_type_code === primaryCode) ?? balances[0];
	const others = balances.filter((b) => b.leave_type_code !== primary?.leave_type_code);

	if (!primary) {
		return (
			<section className="glass-surface rounded-xl p-5">
				<p className="text-text-tertiary text-small">No leave balances yet.</p>
			</section>
		);
	}

	const available = num(primary.available);
	const used = num(primary.taken);
	const pending = num(primary.pending);
	const carried = num(primary.carried_forward);
	const expiry =
		carried > 0 && primary.carried_forward_expires_at
			? primary.carried_forward_expires_at
			: null;

	const segments: DonutSegment[] = [
		{ value: Math.max(available, 0.0001), color: typeTone(primary.leave_type_code), label: "Available" },
		{ value: used, color: "coral", label: "Used" },
		{ value: pending, color: "yellow", label: "Pending" },
	].filter((s) => s.value > 0) as DonutSegment[];

	return (
		<section className="glass-surface rounded-xl p-5 flex flex-wrap items-center gap-5">
			<DonutChart
				size={96}
				segments={segments}
				centerLabel={
					<span className="flex flex-col leading-none">
						<span className="text-h1">{available}</span>
						<span className="text-small text-text-tertiary">of {num(primary.entitled)}</span>
					</span>
				}
			/>
			<div className="min-w-0 flex-1">
				<h2 className="text-h2 text-text-primary">
					{primary.leave_type_name ?? primary.leave_type_code} leave
				</h2>
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-secondary mt-1">
					<span>
						Used <b className="text-text-primary tabular-nums">{used}</b>
					</span>
					<span>
						Pending <b className="text-text-primary tabular-nums">{pending}</b>
					</span>
					<span>
						Carried <b className="text-text-primary tabular-nums">{carried}</b>
					</span>
					{expiry && (
						<span className="text-yellow">
							Carry-forward expires in {daysUntil(expiry)} days
						</span>
					)}
				</div>
				{others.length > 0 && (
					<div className="flex flex-wrap gap-2 mt-3">
						{others.map((b) => (
							<button
								key={b.id}
								type="button"
								onClick={() => onSelectType(b.leave_type_code)}
								className="rounded-full"
							>
								<StatusPill
									tone={typeTone(b.leave_type_code)}
									label={`${b.leave_type_code} ${num(b.available)}/${num(b.entitled)}`}
								/>
							</button>
						))}
					</div>
				)}
			</div>
			<Button asChild className="soft-glow rounded-xl">
				<Link to="/leave/apply">
					<Plus className="size-4 mr-1" /> Apply for leave
				</Link>
			</Button>
		</section>
	);
}
