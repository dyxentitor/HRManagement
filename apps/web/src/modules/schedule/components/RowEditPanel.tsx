import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
	type CalendarAssignment,
	type CalendarEmployee,
	type CalendarHoliday,
	type CalendarLeave,
	type CalendarShift,
	scheduleApi,
} from "../api";
import { resolveCellTone } from "../lib/cell-tone";

import { CoverUpPicker } from "./CoverUpPicker";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Weekday = (typeof WEEKDAYS)[number];
type WeekdayPattern = Partial<Record<Weekday, string>>;

interface Props {
	open: boolean;
	employee: CalendarEmployee | null;
	shifts: CalendarShift[];
	defaultRange: { from: string; to: string };
	existingAssignments: CalendarAssignment[];
	leaves: CalendarLeave[];
	holidays: CalendarHoliday[];
	scrollToDate?: string;
	pendingEdits: Map<string, string | null>;
	onDraftChange: (next: Map<string, string | null>) => void;
	onCommit: () => Promise<void>;
	onPatternApply: (pattern: WeekdayPattern, months: 1 | 2 | 3) => Promise<void>;
	onClose: () => void;
	/** Org-wide active employees, used to populate the cover-up picker.
	 *  Optional so older callers compile without changes. */
	teammates?: CalendarEmployee[];
	/** Called after a cover-up is saved or cleared so the parent can refresh. */
	onCoverUpChange?: () => void;
}

function buildDateRange(from: string, to: string): string[] {
	// Use UTC math to avoid local-tz drift across midnight.
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

function formatDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const month = d.toLocaleDateString("en-US", {
		month: "short",
		timeZone: "UTC",
	});
	const day = d.getUTCDate().toString().padStart(2, "0");
	const dow = d.toLocaleDateString("en-US", {
		weekday: "short",
		timeZone: "UTC",
	});
	return `${month} ${day} ${dow}`;
}

const TONE_BG: Record<string, string> = {
	accent: "bg-accent-500/40 text-text-primary",
	lavender: "bg-lavender/40 text-text-primary",
	sky: "bg-sky/40 text-text-primary",
	yellow: "bg-yellow/40 text-text-primary",
	mint: "bg-mint/50 text-canvas font-semibold",
	peach: "bg-peach/10 text-text-tertiary",
	weekend: "bg-surface-elevated text-text-tertiary",
	surface: "bg-surface-hover text-text-tertiary",
	muted: "bg-canvas text-text-disabled",
};

export function RowEditPanel(props: Props) {
	const {
		open,
		employee,
		shifts,
		defaultRange,
		existingAssignments,
		leaves,
		holidays,
		scrollToDate,
		pendingEdits,
		onDraftChange,
		onCommit,
		onPatternApply,
		onClose,
		teammates = [],
		onCoverUpChange,
	} = props;

	const [pattern, setPattern] = useState<WeekdayPattern>({});
	const [patternMonths, setPatternMonths] = useState<1 | 2 | 3>(1);
	const [confirmKind, setConfirmKind] = useState<"close" | "pattern" | null>(
		null,
	);
	const [saving, setSaving] = useState(false);
	const [expandedCoverUp, setExpandedCoverUp] = useState<string | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);

	const dates = useMemo(
		() => buildDateRange(defaultRange.from, defaultRange.to),
		[defaultRange],
	);
	const assignmentByDate = useMemo(() => {
		const m = new Map<string, CalendarAssignment>();
		for (const a of existingAssignments) m.set(a.work_date, a);
		return m;
	}, [existingAssignments]);
	const leaveDates = useMemo(
		() =>
			new Set(
				leaves.filter((l) => l.employee_id === employee?.id).map((l) => l.date),
			),
		[leaves, employee],
	);
	const holidaysByDate = useMemo(() => {
		const m = new Map<string, CalendarHoliday>();
		for (const h of holidays) m.set(h.date, h);
		return m;
	}, [holidays]);

	useEffect(() => {
		if (!open || !scrollToDate || !listRef.current) return;
		const el = listRef.current.querySelector<HTMLElement>(
			`[data-date="${scrollToDate}"]`,
		);
		el?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [open, scrollToDate]);

	if (!open || !employee) return null;

	const isInactive = employee.status !== "active";

	function setDateShift(date: string, shiftId: string | null) {
		const next = new Map(pendingEdits);
		const server = assignmentByDate.get(date);
		const existingShiftId = server?.shift_id ?? null;
		if (shiftId === existingShiftId) {
			next.delete(date);
		} else {
			next.set(date, shiftId);
		}
		onDraftChange(next);
	}

	function handleCancel() {
		if (pendingEdits.size > 0) {
			setConfirmKind("close");
		} else {
			onClose();
		}
	}

	async function handleSave() {
		setSaving(true);
		try {
			await onCommit();
		} finally {
			setSaving(false);
		}
	}

	function handlePatternClick() {
		setConfirmKind("pattern");
	}

	async function applyPatternConfirmed() {
		setConfirmKind(null);
		if (pendingEdits.size > 0) onDraftChange(new Map());
		await onPatternApply(pattern, patternMonths);
	}

	const totalDaysInPattern = (() => {
		const start = new Date(`${defaultRange.from}T00:00:00`);
		const end = new Date(start);
		end.setMonth(end.getMonth() + patternMonths);
		return Math.round((end.getTime() - start.getTime()) / 86400000);
	})();

	return (
		<aside
			role="dialog"
			aria-label="Row editor"
			className="fixed right-0 top-0 bottom-0 w-[360px] bg-surface-elevated border-l border-border-subtle shadow-xl flex flex-col z-40"
		>
			<header className="flex items-center justify-between p-3 border-b border-border-subtle">
				<div>
					<div className="text-text-primary font-semibold">
						{employee.full_name}
					</div>
					<div className="text-text-tertiary text-small">
						{employee.employee_code}
					</div>
				</div>
				<button
					type="button"
					onClick={handleCancel}
					aria-label="Close panel"
					className="text-text-secondary hover:text-text-primary text-lg"
				>
					×
				</button>
			</header>

			<section className="p-3 border-b border-border-subtle">
				<div className="text-small text-text-secondary mb-2">
					Weekday pattern
				</div>
				<div className="grid grid-cols-7 gap-1.5">
					{WEEKDAYS.map((d) => (
						<label key={d} className="text-xs">
							<span className="block text-text-tertiary capitalize mb-0.5 text-center">
								{d}
							</span>
							<select
								aria-label={`Pattern ${d.charAt(0).toUpperCase()}${d.slice(1)}`}
								value={pattern[d] ?? ""}
								disabled={isInactive}
								onChange={(e) =>
									setPattern({ ...pattern, [d]: e.target.value || undefined })
								}
								className="w-full px-1 py-0.5 bg-canvas border border-border-subtle rounded text-text-primary text-xs"
							>
								<option value="">Off</option>
								{shifts.map((s) => (
									<option key={s.id} value={s.id}>
										{s.code}
									</option>
								))}
							</select>
						</label>
					))}
				</div>
				<div className="flex gap-2 mt-2 items-center">
					<div className="flex bg-canvas border border-border-subtle rounded">
						{([1, 2, 3] as const).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setPatternMonths(m)}
								className={cn(
									"text-xs px-2 py-1",
									patternMonths === m
										? "bg-accent-500/20 text-accent-200"
										: "text-text-tertiary hover:text-text-primary",
								)}
							>
								{m}mo
							</button>
						))}
					</div>
					<button
						type="button"
						onClick={handlePatternClick}
						disabled={Object.keys(pattern).length === 0 || isInactive}
						className="text-small px-3 py-1 bg-accent-500/15 text-accent-200 rounded hover:bg-accent-500/25 disabled:opacity-50"
					>
						Apply pattern
					</button>
				</div>
			</section>

			<ul ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
				{dates.map((d) => {
					const server = assignmentByDate.get(d);
					const pendingShift = pendingEdits.get(d);
					const effectiveShiftId =
						pendingShift !== undefined
							? pendingShift
							: server?.shift_id ?? null;
					const isOnLeave = leaveDates.has(d);
					const holiday = holidaysByDate.get(d);
					const synthetic = effectiveShiftId
						? ({
								...(server ?? {}),
								shift_id: effectiveShiftId,
								shift_code:
									shifts.find((s) => s.id === effectiveShiftId)?.code ?? "?",
								is_published: server?.is_published ?? false,
							} as CalendarAssignment)
						: undefined;
					const tone = resolveCellTone({
						employee: { id: employee.id, status: employee.status },
						date: d,
						assignment: synthetic,
						leaves: isOnLeave
							? [{ employee_id: employee.id, date: d, type: "annual" }]
							: [],
						holidays: [],
					});
					const disabled = isInactive || isOnLeave;
					const focused = scrollToDate === d;
					const canCoverUp = !!server && !disabled;
					const isCoverUpExpanded = expandedCoverUp === server?.id;
					return (
						<li
							key={d}
							data-date={d}
							className={cn(
								"px-2 py-1.5 rounded",
								holiday && "ring-1 ring-peach/50",
								focused && "ring-2 ring-accent-500/60",
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<div className="text-small text-text-secondary flex items-center gap-1.5 min-w-0">
									<span>{formatDay(d)}</span>
									{holiday && (
										<span className="text-xs text-peach truncate">
											· {holiday.name}
										</span>
									)}
									{isOnLeave && (
										<span className="text-xs text-mint">· on leave</span>
									)}
									{server?.covering_for_id && !isCoverUpExpanded && (
										<span className="text-xs text-coral truncate">
											· covering {server.covering_for_name ?? "—"}
										</span>
									)}
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<select
										aria-label={formatDay(d)}
										value={effectiveShiftId ?? ""}
										disabled={disabled}
										onChange={(e) => setDateShift(d, e.target.value || null)}
										className={cn(
											"text-xs px-2 py-1 rounded border-0",
											TONE_BG[tone.tone] ?? "bg-canvas",
										)}
									>
										<option value="">Off</option>
										{shifts.map((s) => (
											<option key={s.id} value={s.id}>
												{s.code} — {s.name}
											</option>
										))}
									</select>
									{canCoverUp && (
										<button
											type="button"
											aria-label={`Cover-up for ${formatDay(d)}`}
											onClick={() =>
												setExpandedCoverUp(
													isCoverUpExpanded ? null : server?.id ?? null,
												)
											}
											className={cn(
												"text-xs px-1.5 py-1 rounded border",
												isCoverUpExpanded
													? "border-coral/60 text-coral"
													: server?.covering_for_id
														? "border-coral/40 text-coral hover:bg-coral/10"
														: "border-border-subtle text-text-tertiary hover:text-text-primary",
											)}
										>
											⤿
										</button>
									)}
								</div>
							</div>
							{canCoverUp && isCoverUpExpanded && server && (
								<CoverUpPicker
									assignment={server}
									teammates={teammates}
									onSave={async (coveringForId) => {
										await scheduleApi.coverUp(server.id, coveringForId);
										setExpandedCoverUp(null);
										onCoverUpChange?.();
									}}
									onClear={async () => {
										await scheduleApi.coverUp(server.id, null);
										setExpandedCoverUp(null);
										onCoverUpChange?.();
									}}
									onCancel={() => setExpandedCoverUp(null)}
								/>
							)}
						</li>
					);
				})}
			</ul>

			<footer className="p-3 border-t border-border-subtle flex items-center justify-end gap-2">
				<button
					type="button"
					onClick={handleCancel}
					className="text-small px-3 py-1 text-text-secondary hover:text-text-primary"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={handleSave}
					disabled={pendingEdits.size === 0 || saving}
					className="text-small px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50"
				>
					{saving
						? "Saving…"
						: pendingEdits.size === 0
							? "Save"
							: `Save ${pendingEdits.size} change${pendingEdits.size === 1 ? "" : "s"}`}
				</button>
			</footer>

			{confirmKind === "close" && (
				<div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
					<div className="bg-surface-elevated border border-border-subtle rounded p-3 max-w-xs">
						<p className="text-small text-text-primary">
							Discard {pendingEdits.size} unsaved change
							{pendingEdits.size === 1 ? "" : "s"}?
						</p>
						<div className="flex justify-end gap-2 mt-3">
							<button
								type="button"
								onClick={() => setConfirmKind(null)}
								className="text-small px-3 py-1 text-text-secondary"
							>
								Keep editing
							</button>
							<button
								type="button"
								onClick={() => {
									setConfirmKind(null);
									onDraftChange(new Map());
									onClose();
								}}
								className="text-small px-3 py-1 bg-coral text-canvas rounded"
							>
								Discard
							</button>
						</div>
					</div>
				</div>
			)}

			{confirmKind === "pattern" && (
				<div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
					<div className="bg-surface-elevated border border-border-subtle rounded p-3 max-w-xs">
						<p className="text-small text-text-primary">
							Apply pattern to {totalDaysInPattern} days?
							{pendingEdits.size > 0 && (
								<span className="block text-text-tertiary text-xs mt-1">
									This will discard {pendingEdits.size} unsaved day-list edit
									{pendingEdits.size === 1 ? "" : "s"}.
								</span>
							)}
						</p>
						<div className="flex justify-end gap-2 mt-3">
							<button
								type="button"
								onClick={() => setConfirmKind(null)}
								className="text-small px-3 py-1 text-text-secondary"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={applyPatternConfirmed}
								className="text-small px-3 py-1 bg-accent-500 text-white rounded"
							>
								Apply
							</button>
						</div>
					</div>
				</div>
			)}
		</aside>
	);
}
