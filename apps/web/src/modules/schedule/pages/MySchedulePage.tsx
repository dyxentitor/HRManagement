import { useCallback, useEffect, useState } from "react";

import { type AttendanceRecord, attendanceApi } from "@/modules/attendance/api";
import { type ShiftAssignment, scheduleApi } from "../api";

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
	const [busy, setBusy] = useState<boolean>(false);

	const refresh = useCallback(async () => {
		setError(null);
		try {
			const [a, t] = await Promise.all([
				scheduleApi.myAssignments(weekStart, weekEnd),
				attendanceApi.today(),
			]);
			setAssignments(a);
			setTodayRec(t);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
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

	return (
		<div className="space-y-4 max-w-4xl">
			<h1 className="text-2xl font-bold">My Schedule</h1>

			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}

			<section className="bg-white border rounded p-4">
				<h2 className="font-semibold mb-3">Today — {todayIso}</h2>
				<p className="text-sm text-slate-600 mb-2">
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
						<span className="ml-2 text-amber-700">• Holiday work</span>
					)}
				</p>
				<div className="space-x-2">
					<button
						type="button"
						onClick={clockIn}
						disabled={busy || !!todayRec?.clock_in}
						className="bg-slate-900 text-white py-1.5 px-3 rounded text-sm disabled:opacity-50"
					>
						{busy ? "..." : "Clock in"}
					</button>
					<button
						type="button"
						onClick={clockOut}
						disabled={busy || !todayRec?.clock_in || !!todayRec?.clock_out}
						className="bg-slate-700 text-white py-1.5 px-3 rounded text-sm disabled:opacity-50"
					>
						{busy ? "..." : "Clock out"}
					</button>
				</div>
			</section>

			<section className="bg-white border rounded p-4">
				<div className="flex items-center justify-between mb-3">
					<h2 className="font-semibold">Week of {weekStart}</h2>
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
				<table className="w-full text-sm">
					<thead className="text-left text-slate-500">
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
								return (
									<td key={iso} className="py-2 align-top">
										{a ? (
											<span className="text-xs px-2 py-1 rounded bg-slate-100">
												{a.shift_name}
											</span>
										) : (
											<span className="text-xs text-slate-400">—</span>
										)}
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
