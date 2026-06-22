import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailPanel } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { type LeaveBalance, type LeaveType, leaveApi } from "@/modules/leave/api";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-body w-full";

export interface AdjustLeaveDrawerProps {
	employeeId: string;
	open: boolean;
	onClose: () => void;
	/** Called after a successful adjustment so the parent can refresh balances. */
	onChanged?: () => void;
}

/** One-off +/- balance correction composer with a live before→after preview. */
export function AdjustLeaveDrawer({
	employeeId,
	open,
	onClose,
	onChanged,
}: AdjustLeaveDrawerProps) {
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
		if (open) void load();
	}, [open, load]);

	const current = balances.find((b) => b.leave_type === typeId);
	const now = current ? Number(current.available) : null;
	const deltaNum = Number(delta);
	const next = now !== null && delta !== "" && !Number.isNaN(deltaNum) ? now + deltaNum : null;

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
		<DetailPanel open={open} onClose={onClose} title="Adjust leave balance">
			<div className="space-y-4">
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

				{/* live before → after preview */}
				<div className="glass-surface rounded-2xl px-4 py-5 text-center">
					<p className="layer-eyebrow">Remaining</p>
					<p className="text-3xl font-extralight tabular-nums mt-1">
						<span className="text-text-secondary">{now ?? "—"}</span>
						{next !== null && (
							<>
								<span className="text-accent-200 mx-2">→</span>
								<span className={next < 0 ? "text-coral" : "text-mint"}>{next}</span>
							</>
						)}
					</p>
					<p className="text-small text-text-tertiary mt-1">
						{delta !== "" && !Number.isNaN(deltaNum)
							? `${deltaNum > 0 ? "+" : ""}${deltaNum} days`
							: "Enter an amount"}
					</p>
				</div>

				<Input
					aria-label="Days (+/-)"
					type="number"
					step="0.5"
					placeholder="Days (e.g. 2 or -1)"
					value={delta}
					onChange={(e) => setDelta(e.target.value)}
				/>
				<Input
					aria-label="Reason"
					placeholder="Reason — shows in the audit log (required)"
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
				<Button onClick={submit} disabled={busy} className="soft-glow rounded-xl w-full">
					Apply adjustment
				</Button>
				<p className="text-[11px] text-text-tertiary text-center">
					Recorded as an append-only ledger entry by you.
				</p>
			</div>
		</DetailPanel>
	);
}
