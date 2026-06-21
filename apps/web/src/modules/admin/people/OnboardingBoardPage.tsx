import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type Checklist, type ProgressRow, onboardingBoardApi } from "./onboarding-board-api";
import {
	OVERALL_LABEL,
	OVERALL_TONE,
	type StepCell,
	funnel,
	initials,
	stepTrack,
} from "./onboarding-board-ui";

const AVATAR_BG = ["bg-lavender", "bg-sky", "bg-mint", "bg-peach", "bg-yellow", "bg-coral"];
function avatarBg(id: string): string {
	let h = 0;
	for (const ch of id) h = (h + ch.charCodeAt(0)) % AVATAR_BG.length;
	return AVATAR_BG[h];
}

const DOT: Record<StepCell["state"], string> = {
	done: "bg-mint text-canvas",
	now: "bg-accent-500 text-white",
	wait: "bg-surface-elevated/60 text-text-tertiary",
};

function StepTrack({ cells }: { cells: StepCell[] }) {
	return (
		<div className="flex items-center gap-1.5 flex-1 min-w-0">
			{cells.map((c, i) => (
				<div key={c.label} className="flex items-center gap-1.5 flex-1">
					<div className="flex flex-col items-center gap-1 w-12">
						<span
							className={cn(
								"size-[18px] rounded-full grid place-items-center text-[9px] font-bold",
								DOT[c.state],
							)}
						>
							{c.text}
						</span>
						<span className="text-[8px] uppercase tracking-wide text-text-tertiary">{c.label}</span>
					</div>
					{i < cells.length - 1 && (
						<span
							className={cn(
								"h-0.5 flex-1 rounded-full",
								c.state === "done" ? "bg-mint" : "bg-border-subtle",
							)}
						/>
					)}
				</div>
			))}
		</div>
	);
}

export default function OnboardingBoardPage() {
	const [rows, setRows] = useState<ProgressRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<ProgressRow | null>(null);

	const refresh = useCallback(async () => {
		try {
			setRows(await onboardingBoardApi.progress());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load onboarding");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const f = useMemo(() => funnel(rows), [rows]);

	if (loading) return <Skeleton className="h-64 rounded-2xl" />;

	return (
		<div className="space-y-5">
			<section
				className="relative overflow-hidden rounded-2xl border border-border-subtle p-5 flex flex-wrap items-center justify-between gap-4"
				style={{
					background:
						"radial-gradient(480px 200px at 8% 130%, rgb(124 92 255 / 0.4), transparent 60%), radial-gradient(420px 200px at 82% -40%, rgb(151 217 199 / 0.14), transparent 60%), linear-gradient(120deg, #191330, #120f22 55%, #0e1d1a)",
				}}
			>
				<div className="relative z-10">
					<p className="layer-eyebrow text-accent-200">People · Onboarding</p>
					<h1 className="text-2xl font-extralight tracking-tight">Onboarding progress</h1>
					<p className="text-small text-text-secondary mt-0.5">
						{f.total} tracked · {f.needsHelp} need attention
					</p>
				</div>
				<div className="relative z-10 flex items-center gap-2.5">
					<Stat value={f.inProgress} label="in progress" tone="text-sky" />
					<Stat value={f.needsHelp} label="need help" tone="text-coral" />
					<Stat value={f.complete} label="complete" tone="text-mint" />
				</div>
			</section>

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			<div className="glass-surface rounded-2xl px-1.5 py-1">
				{rows.length === 0 ? (
					<p className="text-small text-text-tertiary text-center py-10">
						No one is onboarding right now. Send an invitation to get started.
					</p>
				) : (
					<ul>
						{rows.map((r) => (
							<li key={r.user_id}>
								<button
									type="button"
									onClick={() => setSelected(r)}
									className="w-full flex items-center gap-3 px-3 py-2.5 border-t border-border-subtle first:border-t-0 text-left hover:bg-surface-elevated/30"
								>
									<span
										className={cn(
											"size-8 rounded-lg grid place-items-center text-[10px] font-bold text-canvas shrink-0",
											avatarBg(r.user_id),
										)}
										aria-hidden
									>
										{initials(r.name)}
									</span>
									<div className="w-32 min-w-0 shrink-0">
										<p className="text-small text-text-primary truncate">{r.name}</p>
										<p className="text-[11px] text-text-tertiary truncate">{r.department ?? "—"}</p>
									</div>
									<StepTrack cells={stepTrack(r)} />
									<StatusPill tone={OVERALL_TONE[r.overall]} label={OVERALL_LABEL[r.overall]} />
								</button>
							</li>
						))}
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

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
	return (
		<div className="glass-surface rounded-xl px-3 py-1.5 text-center">
			<div className={cn("text-base font-light tabular-nums leading-none", tone)}>{value}</div>
			<div className="layer-eyebrow mt-1">{label}</div>
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
					Onboarding checklist{" "}
					{checklist
						? `· ${checklist.items.filter((i) => i.done).length}/${checklist.items.length}`
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
						No employee record yet — link this account to an employee to track tasks.
					</p>
				)}
			</div>
		</div>
	);
}
