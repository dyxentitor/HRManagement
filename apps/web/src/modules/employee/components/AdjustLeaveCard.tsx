import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { type LeaveBalance, type LeaveType, leaveApi } from "@/modules/leave/api";
import { LeaveSubsection } from "./LeaveSubsection";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-small";

export interface AdjustLeaveCardProps {
	employeeId: string;
	onChanged?: () => void;
	embedded?: boolean;
}

/** HR one-off +/- balance correction, with a compact live before→after preview. */
export function AdjustLeaveCard({ employeeId, onChanged, embedded = false }: AdjustLeaveCardProps) {
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [balances, setBalances] = useState<LeaveBalance[]>([]);
	const [typeId, setTypeId] = useState("");
	const [delta, setDelta] = useState("");
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const [t, b] = await Promise.all([
			leaveApi.listTypes().catch(() => []),
			leaveApi.balancesFor(employeeId).catch(() => []),
		]);
		setTypes(t);
		setBalances(b);
		setTypeId((v) => v || t[0]?.id || "");
	}, [employeeId]);

	useEffect(() => {
		void load();
	}, [load]);

	const current = balances.find((b) => b.leave_type === typeId);
	const now = current ? Number(current.available) : null;
	const deltaNum = Number(delta);
	const hasDelta = delta !== "" && !Number.isNaN(deltaNum);
	const next = now !== null && hasDelta ? now + deltaNum : null;

	async function submit() {
		if (!typeId || delta === "" || deltaNum === 0 || !note.trim()) {
			toast.error("Pick a type, a non-zero amount and a reason.");
			return;
		}
		setBusy(true);
		try {
			await leaveApi.adjustBalance({
				employee_id: employeeId,
				leave_type_id: typeId,
				delta,
				note: note.trim(),
			});
			toast.success("Balance adjusted");
			setDelta("");
			setNote("");
			onChanged?.();
			await load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Adjustment failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<LeaveSubsection
			embedded={embedded}
			title="Adjust balance"
			description="One-off +/- correction, recorded in the audit ledger."
		>
			<div className="flex flex-wrap items-end gap-2">
				<label className="flex flex-col gap-1">
					<span className="text-[10px] uppercase tracking-wide text-text-tertiary">Type</span>
					<select
						aria-label="Leave type"
						className={SELECT}
						value={typeId}
						onChange={(e) => setTypeId(e.target.value)}
					>
						{types.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1 w-24">
					<span className="text-[10px] uppercase tracking-wide text-text-tertiary">Days ±</span>
					<Input
						aria-label="Days (+/-)"
						type="number"
						step="0.5"
						placeholder="+2 / -1"
						value={delta}
						onChange={(e) => setDelta(e.target.value)}
						className="h-9"
					/>
				</label>
				{/* compact inline preview */}
				<div className="flex items-center gap-1.5 h-9 px-3 rounded-lg glass-surface tabular-nums text-small">
					<span className="text-text-secondary">{now ?? "—"}</span>
					<span className="text-accent-200">→</span>
					<b
						className={next === null ? "text-text-tertiary" : next < 0 ? "text-coral" : "text-mint"}
					>
						{next ?? "—"}
					</b>
				</div>
			</div>
			<div className="flex items-center gap-2 mt-2">
				<Input
					aria-label="Reason"
					placeholder="Reason — shows in the audit log (required)"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					className="h-9 flex-1"
				/>
				<Button onClick={submit} disabled={busy} className="soft-glow rounded-xl shrink-0">
					Apply
				</Button>
			</div>
		</LeaveSubsection>
	);
}
