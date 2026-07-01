import { Plus, Sparkles } from "lucide-react";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";

import type { MeEarnings, MeEligibility } from "../api";
import { md, rm } from "./format";

export function IncentiveHero({
	earnings,
	eligibility,
	rate,
	projectCount,
	onLogClaim,
	onAccept,
}: {
	earnings: MeEarnings;
	eligibility: MeEligibility;
	rate: string;
	projectCount: number;
	onLogClaim: () => void;
	onAccept: () => void;
}) {
	const eligible = eligibility.is_active;
	const chip = eligible
		? `Bond active · eligible through ${eligibility.period_end ?? ""}`
		: eligibility.has_bond && !eligibility.accepted
			? "Accept your bond to start earning"
			: "Not eligible — no active bond";

	return (
		<section className="relative rounded-2xl overflow-hidden border border-border-subtle min-h-[140px]">
			<div className="hero-aurora absolute inset-0" aria-hidden />
			<div className="relative z-10 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-label text-accent-200">Incentive · Mandays</p>
						<h1 className="text-[28px] font-extrabold tracking-tight flex items-center gap-2 mt-1">
							My Mandays <Sparkles className="size-6 text-yellow" aria-hidden />
						</h1>
						<div className="mt-2">
							<StatusPill
								tone={eligible ? "mint" : eligibility.has_bond ? "yellow" : "lavender"}
								label={chip}
							/>
						</div>
					</div>
					{eligibility.has_bond && !eligibility.accepted ? (
						<Button
							type="button"
							onClick={onAccept}
							className="soft-glow rounded-xl bg-accent-500 text-white"
						>
							Accept bond
						</Button>
					) : (
						<Button
							type="button"
							onClick={onLogClaim}
							disabled={!eligible}
							className="soft-glow rounded-xl bg-accent-500 text-white"
						>
							<Plus className="size-4 mr-1" /> Log a claim
						</Button>
					)}
				</div>

				<div className="mt-5 flex items-baseline gap-3">
					<span className="text-[56px] leading-none font-extrabold tracking-tight tabular-nums">
						{md(earnings.earned_mandays)}
					</span>
					<span className="text-xl text-text-secondary font-semibold">mandays earned</span>
				</div>
				<p className="text-small text-text-secondary mt-2">
					≈ <b className="text-peach">{rm(earnings.earned_rm)}</b> · {rm(rate)} / manday ·
					lifetime approved
				</p>

				<div className="flex flex-wrap gap-x-8 gap-y-3 mt-5">
					<Stat label="This quarter" value={`${md(earnings.this_quarter_mandays)} md`} />
					<Stat
						label="Pending review"
						value={`${md(earnings.pending_mandays)} md`}
						tone="text-yellow"
					/>
					<Stat label="Paid out" value={rm(earnings.paid_rm)} tone="text-sky" />
					<Stat label="Projects" value={`${projectCount} active`} />
				</div>
			</div>
		</section>
	);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
	return (
		<div>
			<p className="text-label text-text-tertiary">{label}</p>
			<p className={`text-lg font-bold ${tone ?? ""}`}>{value}</p>
		</div>
	);
}
