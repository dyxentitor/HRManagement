import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type LeaveOverride, type LeaveType, leaveApi } from "@/modules/leave/api";

const SELECT = "bg-canvas border border-border-subtle rounded px-2 py-1.5 text-small";

/** HR-only inline CRUD for per-employee entitlement overrides. */
export function LeaveOverrideCard({ employeeId }: { employeeId: string }) {
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [overrides, setOverrides] = useState<LeaveOverride[]>([]);
	const [editing, setEditing] = useState<string | null>(null);
	const [editDays, setEditDays] = useState("");
	const [editFrom, setEditFrom] = useState("");
	const [busy, setBusy] = useState(false);

	// add form
	const [newType, setNewType] = useState("");
	const [newDays, setNewDays] = useState("");
	const [newFrom, setNewFrom] = useState("");

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
		setEditDays(o.days_override);
		setEditFrom(o.effective_from);
	}

	async function saveEdit(o: LeaveOverride) {
		if (!editDays || !editFrom) {
			toast.error("Days and an effective date are required.");
			return;
		}
		setBusy(true);
		try {
			// Override rows are immutable server-side (recreate to "edit"): drop + add.
			await leaveApi.deleteOverride(o.id);
			await leaveApi.createOverride(employeeId, {
				leave_type: o.leave_type,
				days_override: editDays,
				effective_from: editFrom,
			});
			toast.success("Override updated");
			setEditing(null);
			await load();
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
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not remove override");
		}
	}

	async function add() {
		if (!newType || !newDays || !newFrom) {
			toast.error("Pick a type, days and an effective date.");
			return;
		}
		setBusy(true);
		try {
			await leaveApi.createOverride(employeeId, {
				leave_type: newType,
				days_override: newDays,
				effective_from: newFrom,
			});
			toast.success("Override added");
			setNewDays("");
			setNewFrom("");
			await load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not add override");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="bg-surface-hover border border-accent-500/30 rounded-lg p-4">
			<header className="flex items-center justify-between mb-1">
				<h2 className="text-h3 text-text-primary">Leave Override</h2>
				<span className="text-[10px] font-bold uppercase tracking-wider text-accent-200 bg-accent-500/15 border border-accent-500/40 px-2 py-0.5 rounded-full">
					HR only
				</span>
			</header>
			<p className="text-small text-text-tertiary mb-3">
				Give this employee a different entitlement for a leave type (drives future accrual).
			</p>

			<ul className="space-y-1.5 mb-3">
				{overrides.length === 0 && (
					<li className="text-small text-text-tertiary">No overrides — defaults apply.</li>
				)}
				{overrides.map((o) =>
					editing === o.id ? (
						<li
							key={o.id}
							className="flex items-center gap-2 rounded-xl px-2.5 py-2 bg-accent-500/10 border border-accent-500/50"
						>
							<b className="w-20 text-small text-text-primary truncate">{typeName(o.leave_type)}</b>
							<Input
								aria-label="Override days"
								type="number"
								step="0.5"
								value={editDays}
								onChange={(e) => setEditDays(e.target.value)}
								className="w-16 h-8 text-center"
							/>
							<Input
								aria-label="Effective from"
								type="date"
								value={editFrom}
								onChange={(e) => setEditFrom(e.target.value)}
								className="flex-1 h-8"
							/>
							<IconBtn label="Save" tone="ok" disabled={busy} onClick={() => saveEdit(o)}>
								<Check className="size-3.5" />
							</IconBtn>
							<IconBtn label="Cancel" onClick={() => setEditing(null)}>
								<X className="size-3.5" />
							</IconBtn>
						</li>
					) : (
						<li
							key={o.id}
							className="group flex items-center gap-2 glass-surface rounded-xl px-3 py-2 text-small"
						>
							<span className="flex-1">
								<b className="text-text-primary">{typeName(o.leave_type)}</b> →{" "}
								<b className="text-accent-200">{o.days_override}</b> days{" "}
								<span className="text-[11px] text-text-tertiary bg-surface-elevated/60 rounded px-1.5 py-0.5">
									from {o.effective_from}
								</span>
							</span>
							<IconBtn label={`Edit ${typeName(o.leave_type)}`} onClick={() => startEdit(o)}>
								<Pencil className="size-3.5" />
							</IconBtn>
							<IconBtn label={`Delete ${typeName(o.leave_type)}`} onClick={() => remove(o.id)}>
								<Trash2 className="size-3.5" />
							</IconBtn>
						</li>
					),
				)}
			</ul>

			<p className="layer-eyebrow mb-1.5">Add override</p>
			<div className="grid grid-cols-[1.2fr_0.7fr_1fr] gap-2 mb-2">
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
				<Input
					aria-label="New override days"
					type="number"
					step="0.5"
					placeholder="Days"
					value={newDays}
					onChange={(e) => setNewDays(e.target.value)}
					className="h-9"
				/>
				<Input
					aria-label="New override effective from"
					type="date"
					value={newFrom}
					onChange={(e) => setNewFrom(e.target.value)}
					className="h-9"
				/>
			</div>
			<Button variant="outline" size="sm" className="w-full" onClick={add} disabled={busy}>
				<Plus className="size-4 mr-1" /> Add override
			</Button>
		</section>
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
			className={cn(
				"size-7 grid place-items-center rounded-lg border shrink-0 disabled:opacity-50",
				tone === "ok"
					? "bg-mint border-mint text-canvas"
					: "border-border-subtle bg-surface-elevated/40 text-text-tertiary hover:text-text-primary hover:border-border-strong",
			)}
		>
			{children}
		</button>
	);
}
