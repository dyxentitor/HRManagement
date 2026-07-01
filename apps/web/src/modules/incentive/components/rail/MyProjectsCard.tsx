import { cn } from "@/lib/utils";

import type { MeClaimable, MeProject } from "../../api";
import { md } from "../format";

/** One card, two groups: projects I've earned on, and open projects I can still claim on. */
export function MyProjectsCard({
	mine,
	claimable,
	onClaim,
}: {
	mine: MeProject[];
	claimable: MeClaimable[];
	onClaim: (projectId: string) => void;
}) {
	return (
		<div className="glass-surface rounded-2xl p-4">
			<h3 className="text-body font-semibold mb-1">My projects</h3>

			<p className="text-label text-text-tertiary mt-3 mb-1">Contributing to</p>
			{mine.length === 0 ? (
				<p className="text-small text-text-tertiary py-1.5">No contributions yet.</p>
			) : (
				<div className="space-y-2.5">
					{mine.map((p) => {
						const pct = Number(p.budget) ? (Number(p.my_mandays) / Number(p.budget)) * 100 : 0;
						return (
							<div key={p.id} className="flex items-center gap-3">
								<div className="flex-1 min-w-0">
									<p className="text-small text-text-primary truncate">{p.name}</p>
									<div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden mt-1.5">
										<div
											className="h-full rounded-full bg-gradient-to-r from-mint to-sky"
											style={{ width: `${Math.min(100, pct)}%` }}
										/>
									</div>
								</div>
								<span className="text-small font-medium tabular-nums">{md(p.my_mandays)} md</span>
							</div>
						);
					})}
				</div>
			)}

			<p className="text-label text-text-tertiary mt-4 mb-1">Open to claim on</p>
			{claimable.length === 0 ? (
				<p className="text-small text-text-tertiary py-1.5">Nothing open to claim right now.</p>
			) : (
				<div className="space-y-1">
					{claimable.map((p) => (
						<div key={p.id} className="flex items-center gap-2.5 py-1.5">
							<div className="flex-1 min-w-0">
								<p className="text-small text-text-primary truncate">{p.name}</p>
								<p className="text-[10px] text-text-tertiary truncate">
									{md(p.remaining)} md left{p.deadline ? ` · due ${p.deadline}` : ""}
								</p>
							</div>
							<button
								type="button"
								onClick={() => onClaim(p.id)}
								className={cn(
									"text-[11px] px-2.5 py-1 rounded-lg border border-accent-500/40 text-accent-200",
									"hover:bg-accent-500/10",
								)}
							>
								Claim
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
