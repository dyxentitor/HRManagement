import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";

import {
	type BulkFillCell,
	type BulkFillWarning,
	type CalendarPayload,
	type Team,
	scheduleApi,
	teamApi,
} from "../api";
import { BuildRosterModal } from "../components/BuildRosterModal";
import { RosterGrid } from "../components/RosterGrid";
import { RosterToolbar } from "../components/RosterToolbar";
import { RowEditPanel } from "../components/RowEditPanel";
import { StatsFooter } from "../components/StatsFooter";

type ViewMode = "week" | "month";

interface PanelState {
	employeeId: string | null;
	scrollToDate?: string;
	draft: Map<string, string | null>;
}

import { isoLocalDate } from "../lib/local-date";

function rangeFor(
	viewMode: ViewMode,
	anchor: Date,
): { from: string; to: string; label: string } {
	if (viewMode === "week") {
		const day = anchor.getDay();
		const diff = (day + 6) % 7;
		const monday = new Date(anchor);
		monday.setDate(anchor.getDate() - diff);
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		return {
			from: isoLocalDate(monday),
			to: isoLocalDate(sunday),
			label: `Week of ${isoLocalDate(monday)}`,
		};
	}
	const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
	return {
		from: isoLocalDate(first),
		to: isoLocalDate(last),
		label: anchor.toLocaleDateString("en-US", {
			month: "long",
			year: "numeric",
		}),
	};
}

export default function RosterPage() {
	const [viewMode, setViewMode] = useState<ViewMode>(
		() => (localStorage.getItem("roster.view_mode") as ViewMode) ?? "week",
	);
	const [anchor, setAnchor] = useState<Date>(new Date());
	const [payload, setPayload] = useState<CalendarPayload | null>(null);
	const [teams, setTeams] = useState<Team[]>([]);
	const [teamId, setTeamId] = useState<string>("");
	const [search, setSearch] = useState<string>("");
	const [panel, setPanel] = useState<PanelState>({
		employeeId: null,
		draft: new Map(),
	});
	const [buildOpen, setBuildOpen] = useState(false);
	const [warnings, setWarnings] = useState<BulkFillWarning[]>([]);
	const [error, setError] = useState<string | null>(null);

	const { from, to, label } = useMemo(
		() => rangeFor(viewMode, anchor),
		[viewMode, anchor],
	);

	useEffect(() => {
		localStorage.setItem("roster.view_mode", viewMode);
	}, [viewMode]);

	const refresh = useCallback(async () => {
		try {
			const calendar = await scheduleApi.calendar({
				from,
				to,
				team_id: teamId || undefined,
				q: search || undefined,
			});
			setPayload(calendar);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
			return;
		}
		try {
			setTeams(await teamApi.list());
		} catch {
			setTeams([]);
		}
	}, [from, to, teamId, search]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const unpublishedCount = useMemo(
		() => (payload?.assignments ?? []).filter((a) => !a.is_published).length,
		[payload],
	);

	function step(direction: 1 | -1) {
		const next = new Date(anchor);
		if (viewMode === "week") next.setDate(next.getDate() + 7 * direction);
		else next.setMonth(next.getMonth() + direction);
		setAnchor(next);
	}

	function openPanelForRow(employeeId: string) {
		if (panel.employeeId === employeeId) return;
		if (panel.employeeId && panel.draft.size > 0) {
			if (
				!window.confirm(
					`Discard ${panel.draft.size} unsaved edit(s) and switch employee?`,
				)
			)
				return;
		}
		setPanel({ employeeId, draft: new Map() });
	}

	function openPanelForCell(employeeId: string, date: string) {
		if (panel.employeeId === employeeId) {
			setPanel((p) => ({ ...p, scrollToDate: date }));
			return;
		}
		if (panel.employeeId && panel.draft.size > 0) {
			if (
				!window.confirm(
					`Discard ${panel.draft.size} unsaved edit(s) and switch employee?`,
				)
			)
				return;
		}
		setPanel({ employeeId, scrollToDate: date, draft: new Map() });
	}

	function closePanel() {
		setPanel({ employeeId: null, draft: new Map() });
	}

	function setPanelDraft(next: Map<string, string | null>) {
		setPanel((p) => ({ ...p, draft: next }));
	}

	async function commitPanel() {
		if (!payload || !panel.employeeId) return;
		const draft = panel.draft;
		const employeeId = panel.employeeId;
		const setBuckets = new Map<string, BulkFillCell[]>();
		const deletes: string[] = [];
		for (const [date, shiftId] of draft) {
			if (shiftId === null) {
				const a = payload.assignments.find(
					(a) => a.employee_id === employeeId && a.work_date === date,
				);
				if (a) deletes.push(a.id);
			} else {
				const bucket = setBuckets.get(shiftId) ?? [];
				bucket.push({ employee_id: employeeId, work_date: date });
				setBuckets.set(shiftId, bucket);
			}
		}
		try {
			const setResults = await Promise.all(
				[...setBuckets.entries()].map(([shift_id, cells]) =>
					scheduleApi.bulkFill({ cells, shift_id, notes: "" }),
				),
			);
			await Promise.all(deletes.map((id) => scheduleApi.deleteAssignment(id)));
			const allWarnings = setResults.flatMap((r) => r.warnings);
			setWarnings(allWarnings);
			closePanel();
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Save failed");
		}
	}

	async function applyPanelPattern(
		pattern: Record<string, string | undefined>,
		months: 1 | 2 | 3,
	) {
		if (!panel.employeeId) return;
		const start = new Date(`${from}T00:00:00`);
		const end = new Date(start);
		end.setMonth(end.getMonth() + months);
		end.setDate(end.getDate() - 1);
		const cleanPattern: Record<string, string> = {};
		for (const [k, v] of Object.entries(pattern)) {
			if (v) cleanPattern[k] = v;
		}
		try {
			await scheduleApi.bulkAssign({
				employee_ids: [panel.employeeId],
				pattern: cleanPattern,
				date_from: from,
				date_to: isoLocalDate(end),
			});
			setPanel((p) => ({ ...p, draft: new Map() }));
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Pattern apply failed");
		}
	}

	async function publish() {
		await scheduleApi.publish(from, to);
		await refresh();
	}

	async function applySelection(
		selection: { employee_id: string; date: string }[],
	) {
		if (!payload || selection.length === 0 || !payload.shifts.length) return;
		const result = await scheduleApi.bulkFill({
			cells: selection.map((s) => ({
				employee_id: s.employee_id,
				work_date: s.date,
			})),
			shift_id: payload.shifts[0].id,
			notes: "",
		});
		setWarnings(result.warnings);
		await refresh();
	}

	const employee = useMemo(() => {
		if (!panel.employeeId || !payload) return null;
		for (const team of payload.teams) {
			const found = team.members.find((m) => m.id === panel.employeeId);
			if (found) return found;
		}
		return null;
	}, [panel.employeeId, payload]);

	const employeeAssignments = useMemo(
		() =>
			payload?.assignments.filter((a) => a.employee_id === panel.employeeId) ??
			[],
		[payload, panel.employeeId],
	);

	const teammates = useMemo(
		() => payload?.teams.flatMap((t) => t.members) ?? [],
		[payload],
	);

	return (
		<div className="space-y-3">
			<PageHeader breadcrumb="Schedule" title="Roster" />

			<RosterToolbar
				rangeLabel={label}
				viewMode={viewMode}
				onViewMode={setViewMode}
				onPrev={() => step(-1)}
				onNext={() => step(1)}
				teams={teams}
				teamId={teamId}
				onTeamId={setTeamId}
				search={search}
				onSearch={setSearch}
				warningCount={warnings.length}
				unpublishedCount={unpublishedCount}
				onPublish={publish}
				onBuild={() => setBuildOpen(true)}
			/>

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{payload === null ? (
				<p className="text-text-tertiary text-small">Loading…</p>
			) : (
				<div
					className={
						panel.employeeId
							? "opacity-60 pointer-events-none transition-opacity"
							: "transition-opacity"
					}
				>
					<RosterGrid
						viewMode={viewMode}
						payload={payload}
						pendingEdits={panel.draft}
						focusedEmployeeId={panel.employeeId ?? undefined}
						focusedDate={panel.scrollToDate}
						onCellOpen={(key) => openPanelForCell(key.employee_id, key.date)}
						onRowOpen={openPanelForRow}
						onSelectionApply={applySelection}
					/>
					<StatsFooter stats={payload.stats} holidays={payload.holidays} />
				</div>
			)}

			{payload && (
				<RowEditPanel
					open={panel.employeeId !== null}
					employee={employee}
					shifts={payload.shifts}
					defaultRange={{ from, to }}
					existingAssignments={employeeAssignments}
					leaves={payload.leaves}
					holidays={payload.holidays}
					scrollToDate={panel.scrollToDate}
					pendingEdits={panel.draft}
					onDraftChange={setPanelDraft}
					onCommit={commitPanel}
					onPatternApply={applyPanelPattern}
					onClose={closePanel}
					teammates={teammates}
					onCoverUpChange={refresh}
				/>
			)}

			<BuildRosterModal
				open={buildOpen}
				shifts={payload?.shifts ?? []}
				weekStart={from}
				weekEnd={to}
				onClose={() => setBuildOpen(false)}
				onApplied={refresh}
			/>
		</div>
	);
}
