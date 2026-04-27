import { useCallback, useEffect, useMemo, useState } from "react";

import { type Shift, type ShiftAssignment, scheduleApi } from "../api";

function startOfWeekISO(d: Date): string {
	const day = d.getDay();
	const diff = (day + 6) % 7;
	const m = new Date(d);
	m.setDate(d.getDate() - diff);
	return m.toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number): string {
	const d = new Date(iso);
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export default function RosterPage() {
	const today = new Date();
	const [weekStart, setWeekStart] = useState<string>(startOfWeekISO(today));
	const weekEnd = addDaysISO(weekStart, 6);
	const [shifts, setShifts] = useState<Shift[]>([]);
	const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<boolean>(false);

	// Bulk-assign form state
	const [employeeIds, setEmployeeIds] = useState<string>("");
	const [pattern, setPattern] = useState<Record<string, string>>({});

	const refresh = useCallback(async () => {
		setError(null);
		try {
			const [s, a] = await Promise.all([
				scheduleApi.listShifts(),
				scheduleApi.listAssignments(weekStart, weekEnd),
			]);
			setShifts(s);
			setAssignments(a);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		}
	}, [weekStart, weekEnd]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	// Roster grouped by employee
	const grid = useMemo(() => {
		const byEmp: Record<
			string,
			{ code: string; days: Record<string, ShiftAssignment | undefined> }
		> = {};
		for (const a of assignments) {
			if (!byEmp[a.employee])
				byEmp[a.employee] = { code: a.employee_code, days: {} };
			byEmp[a.employee].days[a.work_date] = a;
		}
		return byEmp;
	}, [assignments]);

	const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

	async function applyBulk() {
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
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Bulk assign failed");
		} finally {
			setBusy(false);
		}
	}

	async function publish() {
		setBusy(true);
		try {
			const r = await scheduleApi.publish(weekStart, weekEnd);
			alert(`Published ${r.published} assignments`);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Publish failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-4 max-w-6xl">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Roster — Week of {weekStart}</h1>
				<div className="space-x-2 text-sm">
					<button
						type="button"
						onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
						className="text-slate-600 hover:text-slate-900"
					>
						← Previous
					</button>
					<button
						type="button"
						onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
						className="text-slate-600 hover:text-slate-900"
					>
						Next →
					</button>
				</div>
			</div>

			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}

			<section className="bg-white border rounded p-4 space-y-3">
				<h2 className="font-semibold">Bulk assign pattern</h2>
				<label className="block text-sm">
					Employee IDs (comma-separated UUIDs)
					<input
						value={employeeIds}
						onChange={(e) => setEmployeeIds(e.target.value)}
						className="w-full border rounded px-2 py-1 mt-1 font-mono text-xs"
						placeholder="uuid1, uuid2, uuid3"
					/>
				</label>
				<div className="grid grid-cols-7 gap-2">
					{WEEKDAYS.map((d) => (
						<label key={d} className="text-xs">
							<span className="block text-slate-500 capitalize mb-1">{d}</span>
							<select
								value={pattern[d] || ""}
								onChange={(e) =>
									setPattern({ ...pattern, [d]: e.target.value })
								}
								className="w-full border rounded px-1 py-1 text-xs"
							>
								<option value="">Off</option>
								{shifts.map((s) => (
									<option key={s.id} value={s.id}>
										{s.name}
									</option>
								))}
							</select>
						</label>
					))}
				</div>
				<div className="space-x-2">
					<button
						type="button"
						onClick={applyBulk}
						disabled={
							busy || !employeeIds || Object.values(pattern).every((v) => !v)
						}
						className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
					>
						{busy ? "..." : "Apply pattern"}
					</button>
					<button
						type="button"
						onClick={publish}
						disabled={busy}
						className="bg-green-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
					>
						{busy ? "..." : "Publish week"}
					</button>
				</div>
			</section>

			<section className="bg-white border rounded p-4 overflow-x-auto">
				<h2 className="font-semibold mb-3">Roster grid</h2>
				{Object.keys(grid).length === 0 ? (
					<p className="text-slate-500 text-sm">
						No assignments for this week.
					</p>
				) : (
					<table className="w-full text-sm">
						<thead className="text-left text-slate-500">
							<tr>
								<th className="py-1">Employee</th>
								{days.map((iso) => (
									<th key={iso} className="py-1">
										{iso.slice(5)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{Object.entries(grid).map(([empId, row]) => (
								<tr key={empId} className="border-t">
									<td className="py-1.5 font-mono text-xs">{row.code}</td>
									{days.map((iso) => {
										const a = row.days[iso];
										return (
											<td key={iso} className="py-1.5">
												{a ? (
													<span
														className={`text-xs px-2 py-0.5 rounded ${a.is_published ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}
													>
														{a.shift_name}
													</span>
												) : (
													<span className="text-xs text-slate-400">—</span>
												)}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}
