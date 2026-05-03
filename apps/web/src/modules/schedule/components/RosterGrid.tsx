import { useEffect, useMemo, useState } from "react";

import type { CalendarAssignment, CalendarPayload, CalendarTeam } from "../api";
import { resolveCellTone } from "../lib/cell-tone";

import { RosterCell } from "./RosterCell";

interface SelectionKey {
	employee_id: string;
	date: string;
}

interface Props {
	viewMode: "week" | "month";
	payload: CalendarPayload;
	pendingEdits: Map<string, string | null>;
	focusedEmployeeId?: string;
	focusedDate?: string;
	onCellOpen: (
		key: SelectionKey,
		assignment: CalendarAssignment | undefined,
	) => void;
	onRowOpen: (employeeId: string) => void;
	onSelectionApply: (selection: SelectionKey[]) => void;
}

function buildDateRange(from: string, to: string): string[] {
	const out: string[] = [];
	const start = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	const cur = new Date(start);
	while (cur <= end) {
		out.push(cur.toISOString().slice(0, 10));
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return out;
}

export function RosterGrid({
	viewMode,
	payload,
	pendingEdits,
	focusedEmployeeId,
	focusedDate,
	onCellOpen,
	onRowOpen,
	onSelectionApply,
}: Props) {
	const [collapsed, setCollapsed] = useState<Set<string>>(() => {
		const raw = localStorage.getItem("roster.collapsed_teams");
		return new Set<string>(raw ? JSON.parse(raw) : []);
	});
	const [selection, setSelection] = useState<SelectionKey[]>([]);
	const [shiftId, setShiftId] = useState<string>(payload.shifts[0]?.id ?? "");

	useEffect(() => {
		localStorage.setItem(
			"roster.collapsed_teams",
			JSON.stringify([...collapsed]),
		);
	}, [collapsed]);

	const dates = useMemo(
		() => buildDateRange(payload.range.from, payload.range.to),
		[payload.range],
	);

	const assignmentByKey = useMemo(() => {
		const map = new Map<string, CalendarAssignment>();
		for (const a of payload.assignments) {
			map.set(`${a.employee_id}|${a.work_date}`, a);
		}
		return map;
	}, [payload.assignments]);

	function toggleTeam(id: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function handleShiftClick(key: SelectionKey) {
		setSelection((prev) => {
			const exists = prev.some(
				(s) => s.employee_id === key.employee_id && s.date === key.date,
			);
			if (exists)
				return prev.filter(
					(s) => !(s.employee_id === key.employee_id && s.date === key.date),
				);
			return [...prev, key];
		});
	}

	function clearSelection() {
		setSelection([]);
	}

	function applySelection() {
		onSelectionApply(selection);
		setSelection([]);
	}

	return (
		<div className="space-y-2">
			{selection.length > 1 && (
				<div className="sticky top-0 z-10 bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 flex items-center gap-3">
					<span className="text-small">Selected: {selection.length} cells</span>
					<select
						value={shiftId}
						onChange={(e) => setShiftId(e.target.value)}
						className="px-2 py-1 bg-canvas border border-border-subtle rounded text-text-primary text-small"
					>
						{payload.shifts.map((s) => (
							<option key={s.id} value={s.id}>
								{s.code} — {s.name}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={applySelection}
						className="text-small px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600"
					>
						Apply
					</button>
					<button
						type="button"
						onClick={clearSelection}
						className="text-small text-text-secondary hover:text-text-primary"
					>
						Clear
					</button>
				</div>
			)}

			<div className="overflow-x-auto">
				<table className="min-w-full border-separate border-spacing-y-0.5">
					<thead>
						<tr>
							<th className="text-left text-label uppercase text-text-tertiary px-2 py-1 sticky left-0 bg-canvas">
								Employee
							</th>
							{dates.map((d) => (
								<th
									key={d}
									className="text-label uppercase text-text-tertiary text-center px-1 py-1"
								>
									{new Date(`${d}T00:00:00Z`).getUTCDate()}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{payload.teams.map((team) => (
							<TeamRows
								key={team.id ?? "unassigned"}
								team={team}
								collapsed={team.id !== null && collapsed.has(team.id)}
								onToggle={() => team.id && toggleTeam(team.id)}
								dates={dates}
								viewMode={viewMode}
								payload={payload}
								assignmentByKey={assignmentByKey}
								selection={selection}
								pendingEdits={pendingEdits}
								focusedEmployeeId={focusedEmployeeId}
								focusedDate={focusedDate}
								onCellOpen={onCellOpen}
								onRowOpen={onRowOpen}
								onShiftClick={handleShiftClick}
							/>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

interface TeamRowsProps {
	team: CalendarTeam;
	collapsed: boolean;
	onToggle: () => void;
	dates: string[];
	viewMode: "week" | "month";
	payload: CalendarPayload;
	assignmentByKey: Map<string, CalendarAssignment>;
	selection: SelectionKey[];
	pendingEdits: Map<string, string | null>;
	focusedEmployeeId?: string;
	focusedDate?: string;
	onCellOpen: Props["onCellOpen"];
	onRowOpen: Props["onRowOpen"];
	onShiftClick: (key: SelectionKey) => void;
}

function TeamRows(p: TeamRowsProps) {
	const teamColspan = p.dates.length + 1;
	return (
		<>
			<tr>
				<td
					colSpan={teamColspan}
					className="bg-surface-hover px-2 py-1 sticky left-0"
				>
					<button
						type="button"
						onClick={p.onToggle}
						className="text-small font-semibold text-text-primary hover:text-accent-200"
					>
						{p.collapsed ? "▶" : "▼"} {p.team.name}{" "}
						<span className="text-text-tertiary">
							[{p.team.members.length}]
						</span>
					</button>
				</td>
			</tr>
			{!p.collapsed &&
				p.team.members.map((emp) => (
					<tr key={emp.id}>
						<td className="px-2 py-0.5 text-small sticky left-0 bg-canvas whitespace-nowrap">
							<button
								type="button"
								onClick={() => p.onRowOpen(emp.id)}
								className="text-text-primary hover:text-accent-200"
							>
								{emp.full_name}
							</button>
						</td>
						{p.dates.map((d) => {
							const key = `${emp.id}|${d}`;
							const serverAssignment = p.assignmentByKey.get(key);
							const pendingShiftId = p.pendingEdits.get(key);
							const effectiveAssignment =
								pendingShiftId === undefined
									? serverAssignment
									: pendingShiftId === null
										? undefined
										: ({
												...(serverAssignment ?? {}),
												shift_id: pendingShiftId,
												shift_code:
													p.payload.shifts.find((s) => s.id === pendingShiftId)
														?.code ?? "?",
												is_published: false,
											} as CalendarAssignment);
							const tone = resolveCellTone({
								employee: emp,
								date: d,
								assignment: effectiveAssignment,
								leaves: p.payload.leaves,
								holidays: p.payload.holidays,
							});
							const selected = p.selection.some(
								(s) => s.employee_id === emp.id && s.date === d,
							);
							const focused =
								p.focusedEmployeeId === emp.id && p.focusedDate === d;
							const pendingEdit = p.pendingEdits.has(key);
							const shift = effectiveAssignment
								? p.payload.shifts.find(
										(s) => s.id === effectiveAssignment.shift_id,
									)
								: null;
							return (
								<td key={d} className="px-0.5 py-0.5">
									<RosterCell
										viewMode={p.viewMode}
										tone={tone}
										employeeName={emp.full_name}
										date={d}
										shiftName={shift?.name ?? null}
										startTime={shift?.start_time ?? null}
										endTime={shift?.end_time ?? null}
										selected={selected}
										focused={focused}
										pendingEdit={pendingEdit}
										onClick={() =>
											p.onCellOpen(
												{ employee_id: emp.id, date: d },
												serverAssignment,
											)
										}
										onShiftClick={() =>
											p.onShiftClick({ employee_id: emp.id, date: d })
										}
									/>
								</td>
							);
						})}
					</tr>
				))}
		</>
	);
}
