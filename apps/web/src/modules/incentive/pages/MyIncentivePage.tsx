import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";

import { type Claim, type MeSummary, incentiveApi } from "../api";
import { BondAcceptModal } from "../components/BondAcceptModal";
import { ClaimComposer, type ComposerInitial, type ComposerMode } from "../components/ClaimComposer";
import { IncentiveHero } from "../components/IncentiveHero";
import { MandayKpis } from "../components/MandayKpis";
import { MyClaimsList } from "../components/MyClaimsList";
import { EligibilityCard } from "../components/rail/EligibilityCard";
import { EarningTrend } from "../components/rail/EarningTrend";
import { MyProjectsCard } from "../components/rail/MyProjectsCard";
import { PayoutCard } from "../components/rail/PayoutCard";

interface ComposerState {
	mode: ComposerMode;
	initial: ComposerInitial;
	claimId?: string;
}

export default function MyIncentivePage() {
	const [summary, setSummary] = useState<MeSummary | null>(null);
	const [composer, setComposer] = useState<ComposerState | null>(null);
	const [acceptOpen, setAcceptOpen] = useState(false);

	const load = useCallback(async () => {
		setSummary(await incentiveApi.me().catch(() => null));
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	async function acceptBond() {
		const id = summary?.eligibility.bond_id;
		if (!id) return;
		try {
			await incentiveApi.bonds.accept(id);
			toast.success("Bond accepted — you can now claim mandays.");
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not accept bond.");
			throw e; // keep the confirmation dialog open on failure
		}
	}

	function openCreate(projectId = "") {
		setComposer({
			mode: "create",
			initial: { project: projectId, projectName: "", mandays: "", note: "" },
		});
	}
	function openEdit(c: Claim) {
		setComposer({
			mode: "edit",
			claimId: c.id,
			initial: { project: c.project, projectName: c.project_name, mandays: c.mandays, note: c.note },
		});
	}
	function openResubmit(c: Claim) {
		setComposer({
			mode: "resubmit",
			initial: { project: c.project, projectName: c.project_name, mandays: c.mandays, note: c.note },
		});
	}

	async function submitComposer(body: { project: string; mandays: string; note: string }) {
		try {
			if (composer?.mode === "edit" && composer.claimId) {
				await incentiveApi.claims.update(composer.claimId, body);
				toast.success("Claim updated.");
			} else {
				await incentiveApi.claims.create(body);
				toast.success("Claim submitted.");
			}
			setComposer(null);
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not save claim.");
		}
	}

	async function cancelClaim(id: string) {
		try {
			await incentiveApi.claims.cancel(id);
			toast.success("Claim cancelled.");
			void load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not cancel claim.");
		}
	}

	if (!summary) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-40 rounded-2xl" />
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					{["a", "b", "c", "d"].map((k) => (
						<Skeleton key={k} className="h-24 rounded-2xl" />
					))}
				</div>
				<div className="grid lg:grid-cols-[1.7fr_1fr] gap-4">
					<Skeleton className="h-72 rounded-2xl" />
					<Skeleton className="h-72 rounded-2xl" />
				</div>
			</div>
		);
	}

	const eligible = summary.eligibility.is_active;

	return (
		<div className="space-y-4">
			<IncentiveHero
				earnings={summary.earnings}
				eligibility={summary.eligibility}
				rate={summary.rate}
				projectCount={summary.my_projects.length}
				onLogClaim={() => openCreate()}
				onAccept={() => setAcceptOpen(true)}
			/>

			{!summary.has_employee && (
				<div className="glass-surface rounded-2xl p-4 text-small text-text-secondary">
					Your account isn't linked to an employee record yet, so there's nothing to claim. Ask HR
					to finish setting up your profile.
				</div>
			)}

			<MandayKpis earnings={summary.earnings} counts={summary.claim_counts} />

			<div className="grid lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
				<div className="space-y-4">
					{composer ? (
						<ClaimComposer
							key={`${composer.mode}-${composer.claimId ?? "new"}-${composer.initial.project}`}
							mode={composer.mode}
							claimable={summary.claimable_projects}
							initial={composer.initial}
							onClose={() => setComposer(null)}
							onSubmit={submitComposer}
						/>
					) : (
						<button
							type="button"
							onClick={() => openCreate()}
							disabled={!eligible}
							className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border border-dashed border-border-subtle bg-white/[0.02] text-left hover:border-accent-500/40 disabled:opacity-50"
						>
							<span className="flex items-center gap-3">
								<span className="grid size-8 place-items-center rounded-lg bg-accent-500/15 border border-accent-500/30 text-accent-200">
									<Plus className="size-4" />
								</span>
								<span>
									<span className="block text-small font-medium text-text-primary">Log a claim</span>
									<span className="block text-[11px] text-text-tertiary">
										{eligible
											? "Pick a project, enter mandays, add a note"
											: "Accept your bond first to start claiming"}
									</span>
								</span>
							</span>
							<span className="text-[11px] text-text-tertiary">expand</span>
						</button>
					)}

					<MyClaimsList
						claims={summary.claims}
						rate={summary.rate}
						onEdit={openEdit}
						onResubmit={openResubmit}
						onCancel={cancelClaim}
					/>
				</div>

				<div className="space-y-4">
					<EligibilityCard eligibility={summary.eligibility} onAccept={() => setAcceptOpen(true)} />
					<EarningTrend trend={summary.trend} />
					<MyProjectsCard
						mine={summary.my_projects}
						claimable={summary.claimable_projects}
						onClaim={(pid) => openCreate(pid)}
					/>
					<PayoutCard payout={summary.payout} />
				</div>
			</div>

			<BondAcceptModal
				eligibility={summary.eligibility}
				open={acceptOpen}
				onOpenChange={setAcceptOpen}
				onConfirm={acceptBond}
			/>
		</div>
	);
}
