import { CheckSquare, ChevronLeft, ChevronRight, Search, Wand2 } from "lucide-react";

import type { Team } from "../api";

interface Props {
	rangeLabel: string;
	viewMode: "week" | "month";
	onViewMode: (m: "week" | "month") => void;
	onPrev: () => void;
	onToday: () => void;
	onNext: () => void;
	teams: Team[];
	teamId: string;
	onTeamId: (v: string) => void;
	search: string;
	onSearch: (v: string) => void;
	onBuild: () => void;
	onValidate: () => void;
}

const Divider = () => <span className="w-px h-5 bg-border-subtle" aria-hidden />;

export function RosterToolbar(p: Props) {
	return (
		<div className="glass-surface rounded-xl px-3 py-2 flex flex-wrap items-center gap-3">
			{/* Nav */}
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={p.onPrev}
					aria-label="Previous"
					className="size-7 grid place-items-center rounded-lg text-text-secondary hover:bg-surface-elevated/50"
				>
					<ChevronLeft className="size-4" />
				</button>
				<button
					type="button"
					onClick={p.onToday}
					className="text-small px-2.5 py-1 rounded-lg text-text-secondary hover:bg-surface-elevated/50"
				>
					Today
				</button>
				<button
					type="button"
					onClick={p.onNext}
					aria-label="Next"
					className="size-7 grid place-items-center rounded-lg text-text-secondary hover:bg-surface-elevated/50"
				>
					<ChevronRight className="size-4" />
				</button>
				<span className="text-small font-semibold text-text-primary px-2">{p.rangeLabel}</span>
			</div>

			<Divider />

			{/* View */}
			<div className="inline-flex rounded-lg border border-border-subtle overflow-hidden">
				{(["week", "month"] as const).map((m) => (
					<button
						key={m}
						type="button"
						onClick={() => p.onViewMode(m)}
						className={
							p.viewMode === m
								? "text-small px-3 py-1 bg-accent-500 text-white"
								: "text-small px-3 py-1 text-text-tertiary hover:text-text-primary"
						}
					>
						{m === "week" ? "Week" : "Month"}
					</button>
				))}
			</div>

			<Divider />

			{/* Filters */}
			<select
				value={p.teamId}
				onChange={(e) => p.onTeamId(e.target.value)}
				className="text-small px-2.5 py-1.5 bg-surface-elevated/40 border border-border-subtle rounded-lg"
			>
				<option value="">All teams</option>
				{p.teams.map((t) => (
					<option key={t.id} value={t.id}>
						{t.name}
					</option>
				))}
			</select>

			{/* Search */}
			<div className="relative">
				<Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
				<input
					value={p.search}
					onChange={(e) => p.onSearch(e.target.value)}
					placeholder="Search employees…"
					className="text-small pl-8 pr-2 py-1.5 bg-surface-elevated/40 border border-border-subtle rounded-lg w-48"
				/>
			</div>

			{/* Actions */}
			<div className="ml-auto flex items-center gap-2">
				<button
					type="button"
					onClick={p.onValidate}
					className="inline-flex items-center gap-1.5 text-small px-3 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-elevated/50"
				>
					<CheckSquare className="size-3.5" /> Validate
				</button>
				<button
					type="button"
					onClick={p.onBuild}
					className="inline-flex items-center gap-1.5 text-small px-3 py-1.5 rounded-lg border border-border-subtle text-accent-200 hover:bg-surface-elevated/50"
				>
					<Wand2 className="size-3.5" /> Build Roster
				</button>
			</div>
		</div>
	);
}
