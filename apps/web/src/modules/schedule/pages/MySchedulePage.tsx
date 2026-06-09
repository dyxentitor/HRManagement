import { useCallback, useEffect, useState } from "react";

import { KpiTile } from "@/components/hrms";
import type { ClockState } from "@/components/hrms/ClockInOutWidget";
import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";
import { PageHeader } from "@/components/shell/PageHeader";

import {
	ApiError,
	type AttendanceRecord,
	attendanceApi,
} from "@/modules/attendance/api";
import {
	type CalendarHoliday,
	type Shift,
	type ShiftAssignment,
	scheduleApi,
} from "../api";
import { HolidayCard } from "../components/HolidayCard";
import { ScheduleDayCard, type DayShift } from "../components/ScheduleDayCard";
import { ScheduleTodayHero } from "../components/ScheduleTodayHero";
import {
	addDaysIso,
	startOfWeekIsoLocal,
	todayIsoLocal,
} from "../lib/local-date";
import { formatTimeRange, shiftHours } from "../lib/shift-hours";
import { shiftCodeTone } from "../lib/shift-tone";
import { isWeekendIso } from "../lib/weekday";

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function hhmm(iso: string): string {
	return new Date(iso).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
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
	const [shifts, setShifts] = useState<Shift[]>([]);
	const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
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
		// Shifts (for time ranges) are decoupled (§3.7): the week still renders if
		// this fails — cards then show the shift name without a time range.
		try {
			setShifts(await scheduleApi.listShifts());
		} catch {
			setShifts([]);
		}
		// Holidays are decoupled too. A week can straddle a year boundary, so
		// fetch both years.
		try {
			const years = [
				...new Set([weekStart.slice(0, 4), weekEnd.slice(0, 4)]),
			].map(Number);
			const lists = await Promise.all(
				years.map((y) => scheduleApi.listHolidays(y).catch(() => [])),
			);
			setHolidays(
				lists.flat().map((h) => ({ date: h.date, name: h.name, type: h.type })),
			);
		} catch {
			setHolidays([]);
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
	const holidayMap = new Map(holidays.map((h) => [h.date, h] as const));
	const shiftById = new Map(shifts.map((s) => [s.id, s] as const));

	// Holidays for the calendar month(s) the visible week falls in (a straddle
	// week shows both months), sorted by date.
	const monthKeys = [...new Set(days.map((d) => d.slice(0, 7)))].sort();
	const monthHolidays = holidays
		.filter((h) => monthKeys.includes(h.date.slice(0, 7)))
		.sort((a, b) => a.date.localeCompare(b.date));
	const monthLabel = monthKeys
		.map((k) => {
			const [y, m] = k.split("-").map(Number);
			return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
				timeZone: "UTC",
			});
		})
		.join(" – ");

	function buildShift(a: ShiftAssignment | undefined): DayShift | null {
		if (!a) return null;
		const sh = shiftById.get(a.shift);
		return {
			name: a.shift_name,
			tone: shiftCodeTone(a.shift_code),
			timeRange: sh ? formatTimeRange(sh.start_time, sh.end_time) : "",
			isCoverUp: a.covering_for !== null,
			coveringForName: a.covering_for_name,
			isDraft: !a.is_published,
		};
	}

	const dayModels = days.map((iso) => {
		const a = assignments.find((x) => x.work_date === iso);
		return {
			date: iso,
			isToday: iso === todayIso,
			isWeekend: isWeekendIso(iso),
			holidayName: holidayMap.get(iso)?.name ?? null,
			shift: buildShift(a),
		};
	});

	const shiftsCount = dayModels.filter((d) => d.shift).length;
	const totalHours = Math.round(
		dayModels.reduce((sum, d) => {
			const a = assignments.find((x) => x.work_date === d.date);
			const sh = a ? shiftById.get(a.shift) : undefined;
			return (
				sum +
				(sh ? shiftHours(sh.start_time, sh.end_time, sh.crosses_midnight) : 0)
			);
		}, 0),
	);
	const daysOff = 7 - shiftsCount;

	const todayModel = dayModels.find((d) => d.isToday) ?? null;
	const clockState: ClockState = !todayRec?.clock_in
		? { status: "off" }
		: todayRec.clock_out
			? {
					status: "out",
					clockedIn: hhmm(todayRec.clock_in),
					clockedOut: hhmm(todayRec.clock_out),
				}
			: { status: "in", since: todayRec.clock_in };

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

			<ScheduleTodayHero
				dateLabel={formatDate(todayIso)}
				statusLabel={attendanceLabel(todayRec?.status)}
				statusTone={attendanceTone(todayRec?.status)}
				clockState={clockState}
				isHolidayWork={!!todayRec?.is_holiday_work}
				holidayName={todayModel?.holidayName ?? null}
				shift={todayModel?.shift ?? null}
				busy={busy}
				onClockIn={clockIn}
				onClockOut={clockOut}
			/>

			<div className="grid grid-cols-3 gap-3">
				<KpiTile tone="sky" label="Shifts" value={shiftsCount} icon={shiftsCount} />
				<KpiTile tone="lavender" label="Hours" value={`${totalHours}h`} icon="h" />
				<KpiTile tone="mint" label="Days off" value={daysOff} icon={daysOff} />
			</div>

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
							onClick={() => setWeekStart(startOfWeekIsoLocal(new Date()))}
							className="text-text-secondary hover:text-text-primary"
						>
							This week
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

				<div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
					{dayModels.map((d) => (
						<ScheduleDayCard
							key={d.date}
							date={d.date}
							isToday={d.isToday}
							isWeekend={d.isWeekend}
							holidayName={d.holidayName}
							shift={d.shift}
						/>
					))}
				</div>

				<div className="mt-4 border-t border-border-subtle pt-4">
					<h3 className="text-label uppercase text-text-tertiary mb-2">
						Holidays in {monthLabel}
					</h3>
					{monthHolidays.length > 0 ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{monthHolidays.map((h) => (
								<HolidayCard key={h.date} holiday={h} />
							))}
						</div>
					) : (
						<p className="text-small text-text-tertiary">
							No public holidays in {monthLabel}.
						</p>
					)}
				</div>
			</section>
		</div>
	);
}
