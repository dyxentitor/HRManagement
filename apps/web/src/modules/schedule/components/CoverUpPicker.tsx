import { useMemo, useState } from "react";

import type { CalendarAssignment, CalendarEmployee } from "../api";

interface Props {
	assignment: CalendarAssignment;
	teammates: CalendarEmployee[];
	onSave: (coveringForId: string) => Promise<void>;
	onClear: () => Promise<void>;
	onCancel: () => void;
}

export function CoverUpPicker({
	assignment,
	teammates,
	onSave,
	onClear,
	onCancel,
}: Props) {
	const [selected, setSelected] = useState<string>(
		assignment.covering_for_id ?? "",
	);
	const [busy, setBusy] = useState(false);

	const options = useMemo(() => {
		const filtered = teammates.filter(
			(t) => t.id !== assignment.employee_id && t.status === "active",
		);
		const ownTeam =
			teammates.find((t) => t.id === assignment.employee_id)?.team_id ?? null;
		const sameTeam = filtered
			.filter((t) => ownTeam !== null && t.team_id === ownTeam)
			.sort((a, b) => a.full_name.localeCompare(b.full_name));
		const otherTeams = filtered
			.filter((t) => ownTeam === null || t.team_id !== ownTeam)
			.sort((a, b) => a.full_name.localeCompare(b.full_name));
		return { sameTeam, otherTeams };
	}, [teammates, assignment.employee_id]);

	const hasExisting = !!assignment.covering_for_id;

	async function handleSave() {
		if (!selected) return;
		setBusy(true);
		try {
			await onSave(selected);
		} finally {
			setBusy(false);
		}
	}

	async function handleClear() {
		setBusy(true);
		try {
			await onClear();
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="bg-canvas border border-accent-500/40 rounded-md p-3 mt-1.5 space-y-2">
			<div>
				<label
					htmlFor={`coverup-select-${assignment.id}`}
					className="block text-label uppercase text-text-tertiary mb-1"
				>
					Covering for
				</label>
				<select
					id={`coverup-select-${assignment.id}`}
					value={selected}
					onChange={(e) => setSelected(e.target.value)}
					className="w-full bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary text-small"
				>
					<option value="">Choose teammate…</option>
					{options.sameTeam.length > 0 && (
						<optgroup label="Same team">
							{options.sameTeam.map((t) => (
								<option key={t.id} value={t.id}>
									{t.full_name} ({t.employee_code})
								</option>
							))}
						</optgroup>
					)}
					{options.otherTeams.length > 0 && (
						<optgroup label="Other teams">
							{options.otherTeams.map((t) => (
								<option key={t.id} value={t.id}>
									{t.full_name} ({t.employee_code})
								</option>
							))}
						</optgroup>
					)}
				</select>
			</div>

			<div className="flex items-center gap-2 justify-end pt-1">
				{hasExisting && (
					<button
						type="button"
						onClick={handleClear}
						disabled={busy}
						className="mr-auto text-small text-coral hover:text-coral/80 disabled:opacity-50"
					>
						Clear
					</button>
				)}
				<button
					type="button"
					onClick={onCancel}
					disabled={busy}
					className="text-small text-text-secondary hover:text-text-primary disabled:opacity-50 px-2"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={handleSave}
					disabled={busy || !selected}
					className="text-small px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50"
				>
					Save
				</button>
			</div>
		</div>
	);
}
