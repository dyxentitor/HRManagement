import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";
import { PageHeader } from "@/components/shell/PageHeader";

import {
	ApiError,
	type AttendanceRecord,
	attendanceApi,
} from "@/modules/attendance/api";
import { type ShiftAssignment, scheduleApi } from "../api";
import { RosterCell } from "../components/RosterCell";
import { resolveCellTone } from "../lib/cell-tone";
import {
	addDaysIso,
	startOfWeekIsoLocal,
	todayIsoLocal,
} from "../lib/local-date";

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function dayOfMonth(iso: string): string {
	return String(new Date(`${iso}T00:00:00Z`).getUTCDate());
}

type AttendanceTone = "mint" | "yellow" | "coral" | "peach";

function attendanceTone(status: string | null | undefined): AttendanceTone {
	if (!status) return "peach";
	const s = status.toLowerCase();
	if (s === "present" || s === "clocked_in" || s === "on_duty") return "mint";
	if (s === "late") return "yellow";
	if (s === "absent") return "coral";
	return "peach";
}

function attendanceLabel(status: string | null | undefined): string {
	if (!status) return "No record";
	return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export default function MySchedulePage() {
	const [weekStart, setWeekStart] = useState<string>(() =>
		startOfWeekIsoLocal(new Date()),
	);
	const weekEnd = addDaysIso(weekStart, 6);
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

	const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
	const todayIso = todayIsoLocal();

	if (noEmployee) {
		return (
			<div className="space-y-6 max-w-5xl mx-auto">
				<PageHeader breadcrumb="Schedule" title="My Schedule" />
				<NotLinkedEmptyState scope="schedule" />
			</div>
		);
	}

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader breadcrumb="Schedule" title="My Schedule" />

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				<div className="flex items-center justify-between gap-3 mb-3">
					<h2 className="text-h2 text-text-primary">
						Today — {formatDate(todayIso)}
					</h2>
					<StatusPill
						tone={attendanceTone(todayRec?.status)}
						label={attendanceLabel(todayRec?.status)}
					/>
				</div>
				<p className="text-small text-text-secondary mb-3">
					Clock-in:{" "}
					<strong className="text-text-primary">
						{todayRec?.clock_in
							? new Date(todayRec.clock_in).toLocaleTimeString()
							: "—"}
					</strong>
					{"  •  "}
					Clock-out:{" "}
					<strong className="text-text-primary">
						{todayRec?.clock_out
							? new Date(todayRec.clock_out).toLocaleTimeString()
							: "—"}
					</strong>
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

			<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				<div className="flex items-center justify-between mb-3 gap-3">
					<h2 className="text-h2 text-text-primary">
						Week of {formatDate(weekStart)} – {formatDate(weekEnd)}
					</h2>
					<div className="space-x-2 text-small">
						<button
							type="button"
							onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
							className="text-text-secondary hover:text-text-primary"
						>
							← Previous
						</button>
						<button
							type="button"
							onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
							className="text-text-secondary hover:text-text-primary"
						>
							Next →
						</button>
					</div>
				</div>
				<table className="w-full text-sm">
					<thead className="text-left text-text-tertiary border-b border-border-subtle">
						<tr>
							{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
								<th
									key={d}
									className="py-2 text-label uppercase font-semibold tracking-wide"
								>
									{d} {dayOfMonth(days[i])}
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
