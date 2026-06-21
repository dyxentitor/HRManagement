import type { RosterMetrics } from "../lib/roster-derive";

function Card({
	value,
	label,
	tone,
}: {
	value: string;
	label: string;
	tone?: "mint" | "coral" | "sky";
}) {
	const tint =
		tone === "mint"
			? "bg-mint/8"
			: tone === "coral"
				? "bg-coral/8"
				: tone === "sky"
					? "bg-sky/6"
					: "";
	const text =
		tone === "mint"
			? "text-mint"
			: tone === "coral"
				? "text-coral"
				: tone === "sky"
					? "text-sky"
					: "text-text-primary";
	return (
		<div className={`glass-surface rounded-xl px-4 py-3 ${tint}`}>
			<div className={`text-xl font-extralight tabular-nums leading-none ${text}`}>{value}</div>
			<div className="layer-eyebrow mt-1.5">{label}</div>
		</div>
	);
}

/** Five actionable coverage cards derived from the calendar stats (Phase 2). */
export function CoverageDashboard({ metrics }: { metrics: RosterMetrics }) {
	return (
		<section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
			<Card value={`${metrics.coveragePct}%`} label="Coverage" tone="mint" />
			<Card value={String(metrics.todayScheduled)} label="Scheduled today" />
			<Card value={`${metrics.todayDay} · ${metrics.todayNight}`} label="Day · Night" tone="sky" />
			<Card value={String(metrics.todayOnLeave)} label="On leave today" tone="mint" />
			<Card
				value={String(metrics.shortCoverageCount)}
				label="Short coverage"
				tone={metrics.shortCoverageCount > 0 ? "coral" : undefined}
			/>
		</section>
	);
}
