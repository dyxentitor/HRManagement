import { useState } from "react";

import { type Shift, scheduleApi } from "../api";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface Props {
	open: boolean;
	shifts: Shift[];
	weekStart: string;
	weekEnd: string;
	onClose: () => void;
	onApplied: () => void;
}

export function BuildRosterModal({
	open,
	shifts,
	weekStart,
	weekEnd,
	onClose,
	onApplied,
}: Props) {
	const [employeeIds, setEmployeeIds] = useState<string>("");
	const [pattern, setPattern] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	if (!open) return null;

	async function applyPattern() {
		setBusy(true);
		setError(null);
		try {
			const ids = employeeIds
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			const cleanPattern: Record<string, string> = {};
			for (const k of WEEKDAYS) if (pattern[k]) cleanPattern[k] = pattern[k];
			await scheduleApi.bulkAssign({
				employee_ids: ids,
				pattern: cleanPattern,
				date_from: weekStart,
				date_to: weekEnd,
			});
			onApplied();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute inset-0 bg-black/50"
			/>
			<div
				role="dialog"
				aria-modal="true"
				className="relative bg-surface-elevated border border-border-subtle rounded-lg p-5 max-w-2xl w-full space-y-3"
			>
				<h2 className="text-h3 text-text-primary">Build Roster</h2>
				<p className="text-small text-text-tertiary">
					Assign a weekday pattern to selected employees for the visible date
					range.
				</p>
				{error && (
					<p role="alert" className="text-coral text-small">
						{error}
					</p>
				)}
				<label className="block text-small">
					Employee IDs (comma-separated)
					<input
						value={employeeIds}
						onChange={(e) => setEmployeeIds(e.target.value)}
						className="w-full mt-1 px-2 py-1 bg-canvas border border-border-subtle rounded font-mono text-xs"
					/>
				</label>
				<div className="grid grid-cols-7 gap-2">
					{WEEKDAYS.map((d) => (
						<label key={d} className="text-xs">
							<span className="block text-text-secondary capitalize mb-1">
								{d}
							</span>
							<select
								value={pattern[d] ?? ""}
								onChange={(e) =>
									setPattern({ ...pattern, [d]: e.target.value })
								}
								className="w-full px-1 py-1 bg-canvas border border-border-subtle rounded"
							>
								<option value="">Off</option>
								{shifts.map((s) => (
									<option key={s.id} value={s.id}>
										{s.code} — {s.name}
									</option>
								))}
							</select>
						</label>
					))}
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<button
						type="button"
						onClick={onClose}
						className="text-small px-3 py-1 text-text-secondary hover:text-text-primary"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={applyPattern}
						disabled={busy || !employeeIds}
						className="text-small px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50"
					>
						{busy ? "..." : "Apply pattern"}
					</button>
				</div>
			</div>
		</div>
	);
}
