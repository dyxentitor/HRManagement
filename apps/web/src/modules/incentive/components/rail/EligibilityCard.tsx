import { ShieldCheck } from "lucide-react";

import { StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";

import type { MeEligibility } from "../../api";

export function EligibilityCard({
	eligibility,
	onAccept,
}: {
	eligibility: MeEligibility;
	onAccept: () => void;
}) {
	const { has_bond, accepted, is_active, days_remaining, accepted_at, period_end, terms_version } =
		eligibility;
	const expiringSoon = is_active && days_remaining <= 30;

	return (
		<div className="glass-surface rounded-2xl p-4">
			<div className="flex items-center gap-3">
				<span className="grid size-10 place-items-center rounded-full bg-mint/15 text-mint">
					<ShieldCheck className="size-5" aria-hidden />
				</span>
				<div className="flex-1 min-w-0">
					<h3 className="text-body font-semibold">Eligibility</h3>
					<p className="text-[11px] text-text-tertiary truncate">
						{has_bond
							? accepted
								? `Bond accepted${accepted_at ? ` · ${accepted_at.slice(0, 10)}` : ""} · terms ${terms_version}`
								: "Bond awaiting your acceptance"
							: "No bond on file — ask HR to set one up"}
					</p>
				</div>
				<StatusPill
					tone={is_active ? "mint" : accepted ? "yellow" : "lavender"}
					label={is_active ? "Active" : accepted ? "Inactive" : has_bond ? "Not accepted" : "None"}
				/>
			</div>

			{has_bond && !accepted && (
				<Button
					type="button"
					onClick={onAccept}
					className="soft-glow mt-3 w-full rounded-xl bg-accent-500 text-white"
				>
					Accept bond to start earning
				</Button>
			)}

			{is_active && (
				<p
					className={`mt-3 text-[11px] ${expiringSoon ? "text-coral" : "text-text-tertiary"}`}
				>
					{days_remaining} days remaining
					{period_end ? ` · renews before ${period_end}` : ""}
					{expiringSoon ? " — renew soon to keep claiming" : ""}
				</p>
			)}
		</div>
	);
}
