import { useState } from "react";

interface Shift {
	id: string;
	code: string;
	name: string;
}

interface AssignmentLite {
	id: string;
	shift_id: string;
	shift_code: string;
	covering_for_id: string | null;
	covering_for_name: string | null;
	notes: string;
}

interface Props {
	open: boolean;
	assignment: AssignmentLite | null;
	shifts: Shift[];
	onSave: (body: { shift_id: string; notes: string }) => void;
	onDelete: () => void;
	onCoverUp: () => void;
	onClose: () => void;
}

export function CellPopover({
	open,
	assignment,
	shifts,
	onSave,
	onDelete,
	onCoverUp,
	onClose,
}: Props) {
	const [shiftId, setShiftId] = useState<string>(
		assignment?.shift_id ?? shifts[0]?.id ?? "",
	);
	const [notes, setNotes] = useState<string>(assignment?.notes ?? "");

	if (!open) return null;

	return (
		<div
			role="dialog"
			className="bg-surface-elevated border border-border-subtle rounded-lg p-3 shadow-xl space-y-2"
		>
			<label className="block text-small">
				Shift
				<select
					value={shiftId}
					onChange={(e) => setShiftId(e.target.value)}
					className="w-full mt-1 px-2 py-1 bg-canvas border border-border-subtle rounded text-text-primary"
				>
					{shifts.map((s) => (
						<option key={s.id} value={s.id}>
							{s.code} — {s.name}
						</option>
					))}
				</select>
			</label>
			<label className="block text-small">
				Notes
				<textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					className="w-full mt-1 px-2 py-1 bg-canvas border border-border-subtle rounded text-text-primary"
					rows={2}
				/>
			</label>
			<div className="flex justify-between items-center gap-2 pt-1">
				<div className="flex gap-2">
					<button
						type="button"
						className="text-small px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600"
						onClick={() => onSave({ shift_id: shiftId, notes })}
					>
						Save
					</button>
					<button
						type="button"
						className="text-small px-3 py-1 text-text-secondary hover:text-text-primary"
						onClick={onClose}
					>
						Cancel
					</button>
				</div>
				{assignment && (
					<div className="flex gap-2">
						<button
							type="button"
							className="text-small text-accent-200 hover:text-accent-50"
							onClick={onCoverUp}
						>
							Mark cover-up…
						</button>
						<button
							type="button"
							className="text-small text-coral hover:text-coral/80"
							onClick={onDelete}
						>
							Delete
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
