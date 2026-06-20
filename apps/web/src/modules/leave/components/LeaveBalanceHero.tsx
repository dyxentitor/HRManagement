import { CalendarClock, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { DonutChart } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import type { LeaveBalance } from "../api";
import { num } from "../lib/leave-ui";

function fmtDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

export function LeaveBalanceHero({
	balances,
	primaryCode,
}: {
	balances: LeaveBalance[];
	primaryCode: string;
}) {
	const primary =
		balances.find((b) => b.leave_type_code === primaryCode) ??
		[...balances].sort((a, b) => num(b.entitled) - num(a.entitled))[0];

	const available = primary ? num(primary.available) : 0;
	const taken = primary ? num(primary.taken) : 0;
	const pending = primary ? num(primary.pending) : 0;
	const total = available + taken + pending;
	const name = primary?.leave_type_name ?? primary?.leave_type_code ?? "Leave";

	const segments =
		total > 0
			? ([
					{ value: available, color: "mint", label: "Available" },
					{ value: pending, color: "yellow", label: "Pending" },
					{ value: taken, color: "sky", label: "Taken" },
				] as const)
			: ([{ value: 1, color: "sky", label: "No balance" }] as const);

	const carry = primary && num(primary.carried_forward) > 0 ? num(primary.carried_forward) : 0;
	const carryExpiry = primary?.carried_forward_expires_at;

	return (
		<section className="relative grid lg:grid-cols-[1.6fr_1fr] rounded-2xl overflow-hidden border border-border-subtle min-h-[184px]">
			<div className="hero-aurora absolute inset-0" aria-hidden>
				<svg
					viewBox="0 0 1200 200"
					preserveAspectRatio="none"
					className="absolute bottom-0 left-0 w-full opacity-50"
					aria-hidden
				>
					<title>decorative waves</title>
					<path
						d="M0 140 C200 90 380 180 600 130 C820 80 1000 170 1200 120 L1200 200 L0 200 Z"
						fill="rgb(124 92 255 / 0.25)"
					/>
					<path
						d="M0 165 C240 120 420 195 640 155 C880 110 1040 185 1200 150 L1200 200 L0 200 Z"
						fill="rgb(160 207 236 / 0.12)"
					/>
				</svg>
			</div>

			<div className="relative z-10 p-7 flex flex-col justify-center gap-2">
				<p className="layer-eyebrow text-accent-200">{name} balance</p>
				<div className="flex items-end gap-3">
					<span className="text-[44px] font-extralight leading-none tracking-tight tabular-nums">
						{available} days
					</span>
					<span className="text-text-secondary pb-1.5">available</span>
				</div>
				<p className="text-small text-text-secondary">
					{taken} taken · {pending} pending this year.
				</p>
				<div className="flex flex-wrap items-center gap-3 mt-3">
					<Button asChild className="soft-glow rounded-xl">
						<Link to="/leave/apply">
							<Plus className="size-4 mr-1" /> Apply for leave
						</Link>
					</Button>
					{carry > 0 && carryExpiry && (
						<span className="inline-flex items-center gap-2 text-small text-yellow bg-yellow/10 border border-yellow/25 rounded-xl px-3 py-2">
							<CalendarClock className="size-3.5" /> {carry} carry-forward day
							{carry === 1 ? "" : "s"} expire {fmtDay(carryExpiry)}
						</span>
					)}
				</div>
			</div>

			<div className="relative z-10 m-3.5 glass-surface rounded-xl p-4 flex items-center gap-2">
				<DonutChart
					size={92}
					segments={segments as never}
					centerLabel={<span className="text-h3">{available}</span>}
				/>
			</div>
		</section>
	);
}
