import { useCallback, useEffect, useState } from "react";

import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";

import {
	ApiError,
	type AttendanceRecord,
	attendanceApi,
} from "@/modules/attendance/api";
import { type ShiftAssignment, scheduleApi } from "../api";
import { RosterCell } from "../components/RosterCell";
import { resolveCellTone } from "../lib/cell-tone";

function startOfWeekISO(d: Date): string {
	const day = d.getDay(); // 0=Sun..6=Sat
	const diff = (day + 6) % 7; // turn into days-since-Monday
	const monday = new Date(d);
	monday.setDate(d.getDate() - diff);
	return monday.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
	const d = new Date(iso);
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

export default function MySchedulePage() {
	const today = new Date();
	const [weekStart, setWeekStart] = useState<string>(startOfWeekISO(today));
	const weekEnd = addDaysISO(weekStart, 6);
	const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
	const [todayRec, setTodayRec] = useState<AttendanceRecord | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [noEmployee, setNoEmployee] = useState<boolean>(false);
	const [busy, setBusy] = useState<boolean>(false);

	const refresh = useCallback(async () => {
		setError(null);
		setNoEmployee(false);
		try {
			const [a, t] = await Promise.all([
				scheduleApi.myAssignments(weekStart, weekEnd),
				attendanceApi.today(),
			]);
			setAssignments(a);
			setTodayRec(t);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				setNoEmployee(true);
			} else {
				setError(e instanceof Error ? e.message : "Failed to load");
			}
		}
	}, [weekStart, weekEnd]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function clockIn() {
		setBusy(true);
		try {
			await attendanceApi.clockIn();
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Clock-in failed");
		} finally {
			setBusy(false);
		}
	}

	async function clockOut() {
		setBusy(true);
		try {
			await attendanceApi.clockOut();
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Clock-out failed");
		} finally {
			setBusy(false);
		}
	}

	const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
	const todayIso = today.toISOString().slice(0, 10);

	if (noEmployee) {
		return (
			<div className="space-y-4 max-w-4xl">
				<h1 className="text-h1 text-text-primary">My Schedule</h1>
				<NotLinkedEmptyState scope="schedule" />
			</div>
		);
	}

	return (
		<div className="space-y-4 max-w-4xl">
			<h1 className="text-2xl font-bold">My Schedule</h1>

			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}

			<section className="bg-surface border border-border-subtle rounded p-4">
				<h2 className="font-semibold mb-3">Today — {todayIso}</h2>
				<p className="text-sm text-text-secondary mb-2">
					Clock-in:{" "}
					<strong>
						{todayRec?.clock_in
							? new Date(todayRec.clock_in).toLocaleTimeString()
							: "—"}
					</strong>
					{"  •  "}
					Clock-out:{" "}
					<strong>
						{todayRec?.clock_out
							? new Date(todayRec.clock_out).toLocaleTimeString()
							: "—"}
					</strong>
					{"  •  "}
					Status: <strong>{todayRec?.status ?? "no_record"}</strong>
					{todayRec?.is_holiday_work && (
						<span className="ml-2 text-yellow">• Holiday work</span>
					)}
				</p>
				<div className="space-x-2">
					<button
						type="button"
						onClick={clockIn}
						disabled={busy || !!todayRec?.clock_in}
						className="bg-accent-500 text-white py-1.5 px-3 rounded text-sm disabled:opacity-50 hover:bg-accent-600"
					>
						{busy ? "..." : "Clock in"}
					</button>
					<button
						type="button"
						onClick={clockOut}
						disabled={busy || !todayRec?.clock_in || !!todayRec?.clock_out}
						className="bg-canvas border border-border-subtle text-text-secondary py-1.5 px-3 rounded text-sm disabled:opacity-50 hover:bg-surface-hover"
					>
						{busy ? "..." : "Clock out"}
					</button>
				</div>
			</section>

			<section className="bg-surface border border-border-subtle rounded p-4">
				<div className="flex items-center justify-between mb-3">
					<h2 className="font-semibold">Week of {weekStart}</h2>
					<div className="space-x-2 text-sm">
						<button
							type="button"
							onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
							className="text-text-secondary hover:text-text-primary"
						>
							← Previous
						</button>
						<button
							type="button"
							onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
							className="text-text-secondary hover:text-text-primary"
						>
							Next →
						</button>
					</div>
				</div>
				<table className="w-full text-sm">
					<thead className="text-left text-text-secondary border-b border-border-subtle">
						<tr>
							{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
								<th key={d} className="py-1">
									{d} {days[i].slice(5)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						<tr>
							{days.map((iso) => {
								const a = assignments.find((x) => x.work_date === iso);
								const adapted = a
									? {
											id: a.id,
											employee_id: "self",
											work_date: a.work_date,
											shift_id: a.shift,
											shift_code: a.shift_code,
											covering_for_id: a.covering_for,
											covering_for_name: a.covering_for_name,
											is_published: a.is_published,
											notes: a.notes,
										}
									: undefined;
								const tone = resolveCellTone({
									employee: { id: "self", status: "active" },
									date: iso,
									assignment: adapted,
									leaves: [],
									holidays: [],
								});
								return (
									<td key={iso} className="px-0.5 py-0.5 align-top">
										<RosterCell
											viewMode="week"
											tone={tone}
											employeeName="Me"
											date={iso}
											shiftName={a?.shift_name ?? null}
											startTime={null}
											endTime={null}
											selected={false}
											onClick={() => {}}
											onShiftClick={() => {}}
										/>
									</td>
								);
							})}
						</tr>
					</tbody>
				</table>
			</section>
		</div>
	);
}
