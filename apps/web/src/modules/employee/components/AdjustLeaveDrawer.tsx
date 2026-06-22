import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailPanel } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type LeaveOverride, type LeaveType, leaveApi } from "@/modules/leave/api";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-body w-full";

export interface AdjustLeaveDrawerProps {
	employeeId: string;
	open: boolean;
	onClose: () => void;
	/** Called after any successful change so the parent can refresh balances. */
	onChanged?: () => void;
}

export function AdjustLeaveDrawer({
	employeeId,
	open,
	onClose,
	onChanged,
}: AdjustLeaveDrawerProps) {
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [overrides, setOverrides] = useState<LeaveOverride[]>([]);

	// adjustment form
	const [adjType, setAdjType] = useState("");
	const [delta, setDelta] = useState("");
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);

	// override form
	const [ovType, setOvType] = useState("");
	const [ovDays, setOvDays] = useState("");
	const [ovFrom, setOvFrom] = useState("");

	const load = useCallback(async () => {
		const [t, o] = await Promise.all([
			leaveApi.listTypes().catch(() => []),
			leaveApi.overridesFor(employeeId).catch(() => []),
		]);
		setTypes(t);
		setOverrides(o);
		if (t.length > 0) {
			setAdjType((v) => v || t[0].id);
			setOvType((v) => v || t[0].id);
		}
	}, [employeeId]);

	useEffect(() => {
		if (open) void load();
	}, [open, load]);

	const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id;

	async function submitAdjustment() {
		if (!adjType || !delta || Number(delta) === 0 || !note.trim()) {
			toast.error("Pick a type, a non-zero amount and a reason.");
			return;
		}
		setBusy(true);
		try {
			await leaveApi.adjustBalance({
				employee_id: employeeId,
				leave_type_id: adjType,
				delta,
				note: note.trim(),
			});
			toast.success("Balance adjusted");
			setDelta("");
			setNote("");
			onChanged?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Adjustment failed");
		} finally {
			setBusy(false);
		}
	}

	async function addOverride() {
		if (!ovType || !ovDays || !ovFrom) {
			toast.error("Pick a type, days and an effective date.");
			return;
		}
		setBusy(true);
		try {
			await leaveApi.createOverride(employeeId, {
				leave_type: ovType,
				days_override: ovDays,
				effective_from: ovFrom,
			});
			toast.success("Override saved");
			setOvDays("");
			setOvFrom("");
			await load();
			onChanged?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not save override");
		} finally {
			setBusy(false);
		}
	}

	async function removeOverride(id: string) {
		try {
			await leaveApi.deleteOverride(id);
			toast.success("Override removed");
			await load();
			onChanged?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not remove override");
		}
	}

	return (
		<DetailPanel open={open} onClose={onClose} title="Manage leave">
			<div className="space-y-6">
				{/* Section B — one-off adjustment */}
				<section className="space-y-3">
					<p className="layer-eyebrow">Balance adjustment</p>
					<p className="text-small text-text-tertiary">
						Add or remove days as a one-off correction. Recorded in the audit ledger.
					</p>
					<select
						aria-label="Adjustment leave type"
						className={SELECT}
						value={adjType}
						onChange={(e) => setAdjType(e.target.value)}
					>
						{types.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
					<div className="flex gap-2">
						<Input
							aria-label="Days (+/-)"
							type="number"
							step="0.5"
							placeholder="Days (e.g. 2 or -1)"
							value={delta}
							onChange={(e) => setDelta(e.target.value)}
							className="w-40"
						/>
						<Input
							aria-label="Reason"
							placeholder="Reason (required)"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
					<Button onClick={submitAdjustment} disabled={busy} className="soft-glow rounded-xl">
						Apply adjustment
					</Button>
				</section>

				{/* Section A — entitlement overrides */}
				<section className="space-y-3 border-t border-border-subtle pt-5">
					<p className="layer-eyebrow">Entitlement overrides</p>
					<p className="text-small text-text-tertiary">
						Give this employee a different entitlement for a leave type (drives future accrual).
					</p>
					{overrides.length > 0 && (
						<ul className="space-y-1">
							{overrides.map((o) => (
								<li
									key={o.id}
									className="flex items-center gap-2 text-small glass-surface rounded-lg px-3 py-2"
								>
									<span className="flex-1">
										<b className="text-text-primary">{typeName(o.leave_type)}</b> ·{" "}
										{o.days_override} days · from {o.effective_from}
									</span>
									<button
										type="button"
										aria-label={`Remove override ${o.id}`}
										onClick={() => removeOverride(o.id)}
										className="text-text-tertiary hover:text-coral"
									>
										<Trash2 className="size-4" />
									</button>
								</li>
							))}
						</ul>
					)}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
						<select
							aria-label="Override leave type"
							className={cn(SELECT, "sm:col-span-1")}
							value={ovType}
							onChange={(e) => setOvType(e.target.value)}
						>
							{types.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
						<Input
							aria-label="Override days"
							type="number"
							step="0.5"
							placeholder="Days"
							value={ovDays}
							onChange={(e) => setOvDays(e.target.value)}
						/>
						<Input
							aria-label="Effective from"
							type="date"
							value={ovFrom}
							onChange={(e) => setOvFrom(e.target.value)}
						/>
					</div>
					<Button variant="outline" size="sm" onClick={addOverride} disabled={busy}>
						Add override
					</Button>
				</section>
			</div>
		</DetailPanel>
	);
}
