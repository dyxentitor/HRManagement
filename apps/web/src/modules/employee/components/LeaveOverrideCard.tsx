import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LeaveSubsection } from "./LeaveSubsection";
import { Input } from "@/components/ui/input";

import { type LeaveOverride, type LeaveType, leaveApi } from "@/modules/leave/api";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-small";

type Draft = { days_override: string; effective_from: string; effective_to: string; note: string };
const EMPTY: Draft = { days_override: "", effective_from: "", effective_to: "", note: "" };

/** HR inline CRUD for per-employee entitlement overrides (days · from · expires · reason). */
export function LeaveOverrideCard({
	employeeId,
	onChanged,
	embedded = false,
}: {
	employeeId: string;
	onChanged?: () => void;
	embedded?: boolean;
}) {
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [overrides, setOverrides] = useState<LeaveOverride[]>([]);
	const [editing, setEditing] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
	const [busy, setBusy] = useState(false);

	const [newType, setNewType] = useState("");
	const [newDraft, setNewDraft] = useState<Draft>(EMPTY);

	const load = useCallback(async () => {
		const [t, o] = await Promise.all([
			leaveApi.listTypes().catch(() => []),
			leaveApi.overridesFor(employeeId).catch(() => []),
		]);
		setTypes(t);
		setOverrides(o);
		setNewType((v) => v || t[0]?.id || "");
	}, [employeeId]);

	useEffect(() => {
		void load();
	}, [load]);

	const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id;

	function startEdit(o: LeaveOverride) {
		setEditing(o.id);
		setEditDraft({
			days_override: o.days_override,
			effective_from: o.effective_from,
			effective_to: o.effective_to ?? "",
			note: o.note ?? "",
		});
	}

	async function saveEdit(id: string) {
		if (!editDraft.days_override || !editDraft.effective_from) {
			toast.error("Days and an effective date are required.");
			return;
		}
		setBusy(true);
		try {
			await leaveApi.updateOverride(id, {
				days_override: editDraft.days_override,
				effective_from: editDraft.effective_from,
				effective_to: editDraft.effective_to || null,
				note: editDraft.note,
			});
			toast.success("Override updated");
			setEditing(null);
			await load();
			onChanged?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not update override");
		} finally {
			setBusy(false);
		}
	}

	async function remove(id: string) {
		try {
			await leaveApi.deleteOverride(id);
			toast.success("Override removed");
			await load();
			onChanged?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not remove override");
		}
	}

	async function add() {
		if (!newType || !newDraft.days_override || !newDraft.effective_from) {
			toast.error("Pick a type, days and an effective date.");
			return;
		}
		setBusy(true);
		try {
			await leaveApi.createOverride(employeeId, {
				leave_type: newType,
				days_override: newDraft.days_override,
				effective_from: newDraft.effective_from,
				effective_to: newDraft.effective_to || null,
				note: newDraft.note,
			});
			toast.success("Override added");
			setNewDraft(EMPTY);
			await load();
			onChanged?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not add override");
		} finally {
			setBusy(false);
		}
	}

	return (
		<LeaveSubsection
			embedded={embedded}
			title="Leave overrides"
			description="Give this employee a different entitlement for a leave type (drives future accrual)."
		>
			<ul className="space-y-1.5 mb-3">
				{overrides.length === 0 && (
					<li className="text-small text-text-tertiary">No overrides — policy defaults apply.</li>
				)}
				{overrides.map((o) =>
					editing === o.id ? (
						<li
							key={o.id}
							className="rounded-xl px-3 py-2.5 bg-accent-500/10 border border-accent-500/50 space-y-2"
						>
							<div className="flex items-center justify-between">
								<b className="text-small text-text-primary">{typeName(o.leave_type)}</b>
								<div className="flex gap-1.5">
									<IconBtn label="Save" tone="ok" disabled={busy} onClick={() => saveEdit(o.id)}>
										<Check className="size-3.5" />
									</IconBtn>
									<IconBtn label="Cancel" onClick={() => setEditing(null)}>
										<X className="size-3.5" />
									</IconBtn>
								</div>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<Field label="Days">
									<Input
										aria-label="Override days"
										type="number"
										step="0.5"
										value={editDraft.days_override}
										onChange={(e) => setEditDraft({ ...editDraft, days_override: e.target.value })}
										className="h-8"
									/>
								</Field>
								<Field label="From">
									<Input
										aria-label="Effective from"
										type="date"
										value={editDraft.effective_from}
										onChange={(e) => setEditDraft({ ...editDraft, effective_from: e.target.value })}
										className="h-8"
									/>
								</Field>
								<Field label="Expires">
									<Input
										aria-label="Expires"
										type="date"
										value={editDraft.effective_to}
										onChange={(e) => setEditDraft({ ...editDraft, effective_to: e.target.value })}
										className="h-8"
									/>
								</Field>
							</div>
							<Input
								aria-label="Override reason"
								placeholder="Reason (optional)"
								value={editDraft.note}
								onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
								className="h-8"
							/>
						</li>
					) : (
						<li key={o.id} className="glass-surface rounded-xl px-3 py-2 text-small">
							<div className="flex items-center gap-2">
								<span className="flex-1">
									<b className="text-text-primary">{typeName(o.leave_type)}</b> →{" "}
									<b className="text-accent-200">{o.days_override}</b> days{" "}
									<span className="text-[11px] text-text-tertiary bg-surface-elevated/60 rounded px-1.5 py-0.5">
										{o.effective_from}
										{o.effective_to ? ` → ${o.effective_to}` : " → ongoing"}
									</span>
								</span>
								<IconBtn label={`Edit ${typeName(o.leave_type)}`} onClick={() => startEdit(o)}>
									<Pencil className="size-3.5" />
								</IconBtn>
								<IconBtn label={`Delete ${typeName(o.leave_type)}`} onClick={() => remove(o.id)}>
									<Trash2 className="size-3.5" />
								</IconBtn>
							</div>
							{o.note && <p className="text-[11px] text-text-tertiary italic mt-0.5">{o.note}</p>}
						</li>
					),
				)}
			</ul>

			<p className="layer-eyebrow mb-1.5">Add override</p>
			<div className="grid grid-cols-2 gap-2 mb-2">
				<Field label="Leave type">
					<select
						aria-label="New override leave type"
						className={SELECT}
						value={newType}
						onChange={(e) => setNewType(e.target.value)}
					>
						{types.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Days">
					<Input
						aria-label="New override days"
						type="number"
						step="0.5"
						placeholder="Days"
						value={newDraft.days_override}
						onChange={(e) => setNewDraft({ ...newDraft, days_override: e.target.value })}
						className="h-9"
					/>
				</Field>
				<Field label="Effective from">
					<Input
						aria-label="New override effective from"
						type="date"
						value={newDraft.effective_from}
						onChange={(e) => setNewDraft({ ...newDraft, effective_from: e.target.value })}
						className="h-9"
					/>
				</Field>
				<Field label="Expires (optional)">
					<Input
						aria-label="New override expires"
						type="date"
						value={newDraft.effective_to}
						onChange={(e) => setNewDraft({ ...newDraft, effective_to: e.target.value })}
						className="h-9"
					/>
				</Field>
			</div>
			<Input
				aria-label="New override reason"
				placeholder="Reason (optional)"
				value={newDraft.note}
				onChange={(e) => setNewDraft({ ...newDraft, note: e.target.value })}
				className="h-9 mb-2"
			/>
			<Button variant="outline" size="sm" className="w-full" onClick={add} disabled={busy}>
				<Plus className="size-4 mr-1" /> Add override
			</Button>
		</LeaveSubsection>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</span>
			{children}
		</label>
	);
}

function IconBtn({
	label,
	onClick,
	children,
	tone,
	disabled,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
	tone?: "ok";
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
			className={
				tone === "ok"
					? "size-7 grid place-items-center rounded-lg border shrink-0 bg-mint border-mint text-canvas disabled:opacity-50"
					: "size-7 grid place-items-center rounded-lg border shrink-0 border-border-subtle bg-surface-elevated/40 text-text-tertiary hover:text-text-primary hover:border-border-strong disabled:opacity-50"
			}
		>
			{children}
		</button>
	);
}
