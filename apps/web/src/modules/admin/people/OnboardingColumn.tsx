import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { GrowthHero } from "@/modules/certification/components/GrowthHero";
import { type Checklist, type ProgressRow, onboardingBoardApi } from "./onboarding-board-api";
import { OVERALL_LABEL, OVERALL_TONE, funnel, initials, stepTrack } from "./onboarding-board-ui";

const AVATAR_BG = ["bg-lavender", "bg-sky", "bg-mint", "bg-peach", "bg-yellow", "bg-coral"];
function avatarBg(id: string): string {
	let h = 0;
	for (const ch of id) h = (h + ch.charCodeAt(0)) % AVATAR_BG.length;
	return AVATAR_BG[h];
}

export function OnboardingColumn() {
	const [rows, setRows] = useState<ProgressRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<ProgressRow | null>(null);

	const refresh = useCallback(async () => {
		try {
			setRows(await onboardingBoardApi.progress());
		} catch {
			setRows([]);
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);

	const f = useMemo(() => funnel(rows), [rows]);
	const urgent = useMemo(() => rows.find((r) => r.overall === "needs_attention") ?? null, [rows]);

	if (loading) return <Skeleton className="h-[244px] rounded-2xl" />;

	return (
		<div className="flex flex-col gap-3">
			<p className="layer-eyebrow">／ Onboarding progress</p>
			<GrowthHero
				accent="sky"
				eyebrow="Onboarding · progress"
				headline={f.inProgress > 0 ? `${f.inProgress} in progress` : "All caught up"}
				context={`${f.total} tracked · ${f.complete} complete`}
				ringSegments={[
					{ value: f.complete, color: "mint" },
					{ value: f.inProgress, color: "sky" },
					{ value: f.needsHelp, color: "coral" },
				]}
				ringCenter={String(f.total)}
				ringSub="hires"
				tiles={[
					{ n: f.inProgress, label: "Active", tone: "sky" },
					{ n: f.needsHelp, label: "Stuck", tone: "coral" },
					{ n: f.complete, label: "Done", tone: "mint" },
				]}
				nextUp={
					urgent ? (
						<span className="text-text-secondary truncate">
							⏰ Needs help — <b className="text-text-primary">{urgent.name}</b> ·{" "}
							{OVERALL_LABEL[urgent.overall]}
						</span>
					) : (
						<span className="text-text-tertiary">No one is stuck — nice.</span>
					)
				}
			/>

			<div className="glass-surface rounded-2xl px-1.5 py-1">
				{rows.length === 0 ? (
					<p className="text-small text-text-tertiary text-center py-8">No one is onboarding.</p>
				) : (
					<ul className="max-h-[360px] overflow-y-auto">
						{rows.map((r) => {
							const done = stepTrack(r).filter((c) => c.state === "done").length;
							return (
								<li key={r.user_id}>
									<button
										type="button"
										onClick={() => setSelected(r)}
										className="w-full flex items-center gap-2.5 px-2.5 py-2 border-t border-border-subtle first:border-t-0 text-left hover:bg-surface-elevated/30"
									>
										<span
											className={cn(
												"size-7 rounded-lg grid place-items-center text-[9px] font-bold text-canvas shrink-0",
												avatarBg(r.user_id),
											)}
											aria-hidden
										>
											{initials(r.name)}
										</span>
										<div className="min-w-0 flex-1">
											<p className="text-small text-text-primary truncate">{r.name}</p>
											<p className="text-[10px] text-text-tertiary truncate">
												{done}/5 steps
												{r.profile_percent != null ? ` · profile ${r.profile_percent}%` : ""}
											</p>
										</div>
										<StatusPill tone={OVERALL_TONE[r.overall]} label={OVERALL_LABEL[r.overall]} />
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<DetailPanel
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? selected.name : "Onboarding"}
			>
				{selected && <Detail row={selected} onChanged={refresh} />}
			</DetailPanel>
		</div>
	);
}

function Card({ label, value, tone }: { label: string; value: string; tone: string }) {
	return (
		<div className="glass-surface rounded-xl px-3 py-2">
			<div className="layer-eyebrow">{label}</div>
			<div className={cn("text-small mt-0.5", tone)}>{value}</div>
		</div>
	);
}

function Detail({ row, onChanged }: { row: ProgressRow; onChanged: () => void }) {
	const [checklist, setChecklist] = useState<Checklist | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (row.checklist_id) {
			onboardingBoardApi
				.getChecklist(row.checklist_id)
				.then(setChecklist)
				.catch(() => setChecklist(null));
		} else {
			setChecklist(null);
		}
	}, [row.checklist_id]);

	async function start() {
		if (!row.employee_id) return;
		setBusy(true);
		try {
			setChecklist(await onboardingBoardApi.startChecklist(row.employee_id));
			onChanged();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not start the checklist");
		} finally {
			setBusy(false);
		}
	}
	async function toggle(itemId: string) {
		if (!checklist) return;
		try {
			setChecklist(await onboardingBoardApi.toggleItem(checklist.id, itemId));
			onChanged();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not update the item");
		}
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-2">
				<Card
					label="Account"
					value={row.account_activated ? "Activated" : "Not yet"}
					tone={row.account_activated ? "text-mint" : "text-text-tertiary"}
				/>
				<Card
					label="Profile"
					value={
						row.profile_percent == null
							? "No employee"
							: `${row.profile_percent}%${row.profile_missing.length ? ` · ${row.profile_missing[0]} missing` : ""}`
					}
					tone={row.profile_percent === 100 ? "text-mint" : "text-yellow"}
				/>
				<Card
					label="Two-factor"
					value={row.mfa_enabled ? "Enabled" : "Not set"}
					tone={row.mfa_enabled ? "text-mint" : "text-text-tertiary"}
				/>
				<Card
					label="Wizard"
					value={row.wizard_completed ? "Finished" : (row.wizard_step ?? "Not started")}
					tone="text-sky"
				/>
			</div>
			<div>
				<p className="layer-eyebrow mb-2">
					Checklist
					{checklist
						? ` · ${checklist.items.filter((i) => i.done).length}/${checklist.items.length}`
						: ""}
				</p>
				{checklist ? (
					<ul className="space-y-0.5">
						{checklist.items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() => toggle(item.id)}
									className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-surface-elevated/40 text-small"
								>
									<span
										className={cn(
											"size-4 rounded grid place-items-center shrink-0 border",
											item.done
												? "bg-mint border-mint text-canvas"
												: "border-border-strong text-transparent",
										)}
									>
										<Check className="size-3" />
									</span>
									<span
										className={item.done ? "text-text-secondary line-through" : "text-text-primary"}
									>
										{item.label}
									</span>
								</button>
							</li>
						))}
					</ul>
				) : row.employee_id ? (
					<Button variant="outline" size="sm" onClick={start} disabled={busy}>
						{busy ? "Starting…" : "Start onboarding checklist"}
					</Button>
				) : (
					<p className="text-small text-text-tertiary">
						No employee record yet — link this account to track tasks.
					</p>
				)}
			</div>
		</div>
	);
}
