import type { Team } from "../api";

interface Props {
	rangeLabel: string;
	viewMode: "week" | "month";
	onViewMode: (m: "week" | "month") => void;
	onPrev: () => void;
	onNext: () => void;
	teams: Team[];
	teamId: string;
	onTeamId: (v: string) => void;
	search: string;
	onSearch: (v: string) => void;
	warningCount: number;
	unpublishedCount: number;
	onPublish: () => void;
	onBuild: () => void;
}

export function RosterToolbar(p: Props) {
	return (
		<div className="flex flex-wrap items-center gap-2 bg-surface-hover border border-border-subtle rounded-lg p-2">
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={p.onPrev}
					className="text-small px-2 py-1 text-text-secondary hover:text-text-primary"
				>
					◀
				</button>
				<span className="text-small font-semibold text-text-primary px-2">
					{p.rangeLabel}
				</span>
				<button
					type="button"
					onClick={p.onNext}
					className="text-small px-2 py-1 text-text-secondary hover:text-text-primary"
				>
					▶
				</button>
			</div>

			<div className="flex bg-canvas border border-border-subtle rounded">
				{(["week", "month"] as const).map((m) => (
					<button
						key={m}
						type="button"
						onClick={() => p.onViewMode(m)}
						className={
							p.viewMode === m
								? "text-small px-3 py-1 bg-accent-500/20 text-accent-200"
								: "text-small px-3 py-1 text-text-tertiary hover:text-text-primary"
						}
					>
						{m === "week" ? "Week" : "Month"}
					</button>
				))}
			</div>

			<select
				value={p.teamId}
				onChange={(e) => p.onTeamId(e.target.value)}
				className="text-small px-2 py-1 bg-canvas border border-border-subtle rounded"
			>
				<option value="">All teams</option>
				{p.teams.map((t) => (
					<option key={t.id} value={t.id}>
						{t.name}
					</option>
				))}
			</select>

			<input
				value={p.search}
				onChange={(e) => p.onSearch(e.target.value)}
				placeholder="Search employee…"
				className="text-small px-2 py-1 bg-canvas border border-border-subtle rounded w-48"
			/>

			{p.warningCount > 0 && (
				<span className="text-small text-coral bg-coral/10 px-2 py-0.5 rounded">
					⚠ {p.warningCount}
				</span>
			)}

			<div className="ml-auto flex gap-2">
				<button
					type="button"
					onClick={p.onBuild}
					className="text-small px-3 py-1 text-accent-200 hover:text-accent-50"
				>
					Build Roster
				</button>
				<button
					type="button"
					onClick={p.onPublish}
					className="text-small px-3 py-1 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50"
					disabled={p.unpublishedCount === 0}
				>
					Publish ({p.unpublishedCount})
				</button>
			</div>
		</div>
	);
}
