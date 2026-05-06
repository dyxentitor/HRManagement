import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataTable } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { employeeApi } from "@/modules/employee/api";

import { type Team, type TeamWritePayload, teamApi } from "../teams-api";

type Modal =
	| { kind: "closed" }
	| { kind: "create" }
	| { kind: "edit"; team: Team }
	| { kind: "archive"; team: Team };

export default function AdminTeamsPage() {
	const [teams, setTeams] = useState<Team[]>([]);
	const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
	const [loading, setLoading] = useState(true);
	const [modal, setModal] = useState<Modal>({ kind: "closed" });

	const refresh = useCallback(async () => {
		const [ts, ems] = await Promise.all([
			teamApi.list(),
			employeeApi.list().catch(() => []),
		]);
		setTeams(ts);
		const counts: Record<string, number> = {};
		for (const e of ems) {
			const teamId = (e as { team?: string | null }).team ?? null;
			if (teamId) counts[teamId] = (counts[teamId] ?? 0) + 1;
		}
		setMemberCounts(counts);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		refresh()
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [refresh]);

	const teamById = useMemo(() => {
		const m = new Map<string, Team>();
		for (const t of teams) m.set(t.id, t);
		return m;
	}, [teams]);

	return (
		<div className="space-y-4">
			<PageHeader
				title="Teams"
				subtitle={loading ? "Loading…" : `${teams.length} active`}
				actions={
					<Button
						type="button"
						onClick={() => setModal({ kind: "create" })}
						className="bg-accent-500 hover:bg-accent-600 text-white"
					>
						<Plus className="size-4 mr-1" /> New team
					</Button>
				}
			/>

			{!loading && teams.length === 0 ? (
				<div className="bg-surface-hover border border-dashed border-border-subtle rounded-lg p-8 text-center text-text-tertiary">
					No teams yet — click + New team to add one.
				</div>
			) : (
				<DataTable
					rows={teams}
					rowKey={(t) => t.id}
					columns={[
						{ key: "name", header: "Name", render: (t) => t.name },
						{
							key: "parent",
							header: "Parent",
							render: (t) =>
								t.parent_team ? teamById.get(t.parent_team)?.name ?? "—" : "—",
						},
						{
							key: "sort",
							header: "Order",
							render: (t) => t.sort_order ?? 0,
							align: "right",
						},
						{
							key: "min",
							header: "Min staff",
							render: (t) => t.min_headcount ?? "—",
							align: "right",
						},
						{
							key: "members",
							header: "Members",
							render: (t) => memberCounts[t.id] ?? 0,
							align: "right",
						},
						{
							key: "actions",
							header: "",
							render: (t) => (
								<div className="flex justify-end gap-2">
									<button
										type="button"
										aria-label={`Edit ${t.name}`}
										onClick={() => setModal({ kind: "edit", team: t })}
										className="text-small text-accent-200 hover:text-accent-50"
									>
										Edit
									</button>
									<button
										type="button"
										aria-label={`Archive ${t.name}`}
										onClick={() => setModal({ kind: "archive", team: t })}
										className="text-small text-coral hover:text-coral/80"
									>
										Archive
									</button>
								</div>
							),
							align: "right",
						},
					]}
				/>
			)}

			{(modal.kind === "create" || modal.kind === "edit") && (
				<TeamModal
					modal={modal}
					teams={teams}
					onCancel={() => setModal({ kind: "closed" })}
					onSaved={async () => {
						setModal({ kind: "closed" });
						await refresh();
					}}
				/>
			)}

			{modal.kind === "archive" && (
				<Dialog open onOpenChange={() => setModal({ kind: "closed" })}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Archive {modal.team.name}?</DialogTitle>
						</DialogHeader>
						<p className="text-body text-text-secondary">
							Employees currently assigned to this team will be left without a
							team and need to be reassigned.
						</p>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setModal({ kind: "closed" })}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={async () => {
									await teamApi.archive(modal.team.id);
									setModal({ kind: "closed" });
									await refresh();
								}}
								className="bg-coral text-white"
							>
								Confirm
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}

function TeamModal({
	modal,
	teams,
	onCancel,
	onSaved,
}: {
	modal: { kind: "create" } | { kind: "edit"; team: Team };
	teams: Team[];
	onCancel: () => void;
	onSaved: () => void | Promise<void>;
}) {
	const editing = modal.kind === "edit" ? modal.team : null;
	const [name, setName] = useState(editing?.name ?? "");
	const [parent, setParent] = useState<string>(editing?.parent_team ?? "");
	const [order, setOrder] = useState<number>(editing?.sort_order ?? 0);
	const [min, setMin] = useState<string>(
		editing?.min_headcount != null ? String(editing.min_headcount) : "",
	);
	const [busy, setBusy] = useState(false);
	const [showOrderTip, setShowOrderTip] = useState(false);

	async function save() {
		setBusy(true);
		try {
			const payload: TeamWritePayload = {
				name,
				parent_team: parent || null,
				sort_order: order,
				min_headcount: min === "" ? null : Number(min),
			};
			if (editing) {
				await teamApi.update(editing.id, payload);
			} else {
				await teamApi.create(payload);
			}
			await onSaved();
		} finally {
			setBusy(false);
		}
	}

	const parentOptions = teams.filter((t) => !editing || t.id !== editing.id);

	return (
		<Dialog open onOpenChange={onCancel}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{editing ? "Edit team" : "Create team"}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div className="block">
						<label
							htmlFor="team-name"
							className="text-label uppercase text-text-tertiary block mb-1"
						>
							Name
						</label>
						<Input
							id="team-name"
							aria-label="Name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="block">
						<label
							htmlFor="team-parent"
							className="text-label uppercase text-text-tertiary block mb-1"
						>
							Parent team
						</label>
						<select
							id="team-parent"
							aria-label="Parent team"
							className="w-full bg-canvas border border-border-subtle rounded px-2 py-1.5"
							value={parent}
							onChange={(e) => setParent(e.target.value)}
						>
							<option value="">— (top level)</option>
							{parentOptions.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</div>
					<div className="block">
						<label
							htmlFor="team-sort"
							className="text-label uppercase text-text-tertiary block mb-1"
						>
							Sort order
						</label>
						<Input
							id="team-sort"
							aria-label="Sort order"
							type="number"
							value={order}
							onChange={(e) => {
								setOrder(Number(e.target.value));
								if (
									!showOrderTip &&
									!localStorage.getItem("teams.sortOrderTipSeen")
								) {
									setShowOrderTip(true);
									localStorage.setItem("teams.sortOrderTipSeen", "1");
								}
							}}
						/>
						{showOrderTip && (
							<p className="text-small text-text-tertiary mt-1">
								Sort order controls display order in the roster grid. Lower
								numbers appear first.
							</p>
						)}
					</div>
					<div className="block">
						<label
							htmlFor="team-min"
							className="text-label uppercase text-text-tertiary block mb-1"
						>
							Min headcount
						</label>
						<Input
							id="team-min"
							aria-label="Min headcount"
							type="number"
							value={min}
							onChange={(e) => setMin(e.target.value)}
							placeholder="optional"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button type="button" onClick={save} disabled={busy || !name}>
						{busy ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
