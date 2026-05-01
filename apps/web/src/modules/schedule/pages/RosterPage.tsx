import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";

import {
	type BulkFillWarning,
	type CalendarAssignment,
	type CalendarPayload,
	type Team,
	scheduleApi,
	teamApi,
} from "../api";
import { BuildRosterModal } from "../components/BuildRosterModal";
import { CellPopover } from "../components/CellPopover";
import { RosterGrid } from "../components/RosterGrid";
import { RosterToolbar } from "../components/RosterToolbar";
import { StatsFooter } from "../components/StatsFooter";

type ViewMode = "week" | "month";

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

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
			from: isoDate(monday),
			to: isoDate(sunday),
			label: `Week of ${isoDate(monday)}`,
		};
	}
	const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
	return {
		from: isoDate(first),
		to: isoDate(last),
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
	const [popover, setPopover] = useState<{
		employee_id: string;
		date: string;
		assignment: CalendarAssignment | undefined;
	} | null>(null);
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
		// Calendar is required (the grid can't render without it). Teams is a
		// nice-to-have for the filter dropdown — if it 403s on a misconfigured
		// role, the grid still renders.
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
			// Teams unavailable — fall back to empty list. Filter dropdown will
			// only offer "All teams"; the grid still works.
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

	async function publish() {
		await scheduleApi.publish(from, to);
		await refresh();
	}

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
				<>
					<RosterGrid
						viewMode={viewMode}
						payload={payload}
						onCellClick={(key, assignment) =>
							setPopover({ ...key, assignment })
						}
						onSelectionApply={applySelection}
					/>
					{popover && (
						<CellPopover
							open
							assignment={
								popover.assignment
									? {
											id: popover.assignment.id,
											shift_id: popover.assignment.shift_id,
											shift_code: popover.assignment.shift_code,
											covering_for_id: popover.assignment.covering_for_id,
											covering_for_name: popover.assignment.covering_for_name,
											notes: popover.assignment.notes,
										}
									: null
							}
							shifts={payload.shifts}
							onSave={async (b) => {
								await scheduleApi.bulkFill({
									cells: [
										{
											employee_id: popover.employee_id,
											work_date: popover.date,
										},
									],
									shift_id: b.shift_id,
									notes: b.notes,
								});
								setPopover(null);
								await refresh();
							}}
							onDelete={async () => {
								if (popover.assignment) {
									await scheduleApi.deleteAssignment(popover.assignment.id);
									setPopover(null);
									await refresh();
								}
							}}
							onCoverUp={() => {
								const coveringForId = window.prompt(
									"Covering for employee ID (paste UUID):",
								);
								if (popover.assignment && coveringForId) {
									scheduleApi
										.coverUp(popover.assignment.id, coveringForId)
										.then(() => {
											setPopover(null);
											refresh();
										});
								}
							}}
							onClose={() => setPopover(null)}
						/>
					)}
					<StatsFooter stats={payload.stats} />
				</>
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
