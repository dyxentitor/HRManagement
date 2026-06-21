import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RosterMetrics } from "../lib/roster-derive";

function Chip({
	value,
	label,
	tone,
}: {
	value: string;
	label: string;
	tone: "mint" | "coral" | "yellow";
}) {
	const text = tone === "mint" ? "text-mint" : tone === "coral" ? "text-coral" : "text-yellow";
	return (
		<div className="glass-surface rounded-xl px-3 py-1.5 text-center min-w-16">
			<div className={`text-base font-light tabular-nums leading-none ${text}`}>{value}</div>
			<div className="layer-eyebrow mt-1">{label}</div>
		</div>
	);
}

/** Aurora workspace header — title, range, and live coverage/conflict/publish status. */
export function RosterWorkspaceHeader({
	rangeLabel,
	viewMode,
	metrics,
	onPublish,
}: {
	rangeLabel: string;
	viewMode: "week" | "month";
	metrics: RosterMetrics;
	onPublish: () => void;
}) {
	const published = metrics.unpublishedCount === 0;
	return (
		<section
			className="relative overflow-hidden rounded-2xl border border-border-subtle p-5 flex flex-wrap items-center justify-between gap-4"
			style={{
				background:
					"radial-gradient(520px 220px at 8% 130%, rgb(124 92 255 / 0.4), transparent 60%), radial-gradient(440px 220px at 80% -40%, rgb(151 217 199 / 0.14), transparent 60%), linear-gradient(120deg, #191330, #120f22 55%, #0e1d1a)",
			}}
		>
			<div className="relative z-10">
				<p className="layer-eyebrow text-accent-200">Workforce planning</p>
				<h1 className="text-2xl font-extralight tracking-tight">Roster Planning</h1>
				<p className="text-small text-text-secondary mt-0.5">
					{rangeLabel} · {viewMode === "week" ? "Week" : "Month"} view · {metrics.employeeCount}{" "}
					employee{metrics.employeeCount === 1 ? "" : "s"}
				</p>
			</div>
			<div className="relative z-10 flex items-center gap-2.5">
				<Chip value={`${metrics.coveragePct}%`} label="coverage" tone="mint" />
				<Chip
					value={String(metrics.conflictCount)}
					label="conflicts"
					tone={metrics.conflictCount > 0 ? "coral" : "mint"}
				/>
				<div className="glass-surface rounded-xl px-3 py-1.5 text-center">
					<div
						className={`text-sm font-semibold leading-none ${published ? "text-mint" : "text-yellow"}`}
					>
						{published ? "Published" : "Draft"}
					</div>
					<div className="layer-eyebrow mt-1">
						{published ? "all live" : `${metrics.unpublishedCount} unpublished`}
					</div>
				</div>
				<Button
					type="button"
					onClick={onPublish}
					disabled={published}
					className="soft-glow rounded-xl"
				>
					<UploadCloud className="size-4 mr-1.5" /> Publish
				</Button>
			</div>
		</section>
	);
}
