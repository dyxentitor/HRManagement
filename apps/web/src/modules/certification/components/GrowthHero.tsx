import type { ReactNode } from "react";

import { DonutChart } from "@/components/hrms";
import { cn } from "@/lib/utils";
import type { Tone } from "../lib/cert-ui";

export interface HeroTile {
	n: number;
	label: string;
	tone: Tone;
}

export interface HeroSegment {
	value: number;
	color: Tone;
}

const DOT: Record<Tone, string> = {
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
	lavender: "bg-lavender",
};

const TILE_TEXT: Record<Tone, string> = {
	mint: "text-mint",
	yellow: "text-yellow",
	coral: "text-coral",
	sky: "text-sky",
	lavender: "text-lavender",
};

const SEG_BG: Record<Tone, string> = {
	mint: "bg-mint",
	yellow: "bg-yellow",
	coral: "bg-coral",
	sky: "bg-sky",
	lavender: "bg-lavender",
};

/**
 * Shared, equal-height hero for the Growth columns. Both Certifications and
 * Training render this with the same anatomy — ring · headline · composition
 * bar · 3 stat tiles · "next up" callout — so they're pixel-matched.
 */
export function GrowthHero({
	eyebrow,
	headline,
	context,
	ringSegments,
	ringCenter,
	ringSub,
	tiles,
	nextUp,
	action,
	accent,
}: {
	eyebrow: string;
	headline: string;
	context: string;
	ringSegments: HeroSegment[];
	ringCenter: string;
	ringSub: string;
	tiles: HeroTile[];
	nextUp: ReactNode;
	action?: ReactNode;
	accent: "yellow" | "sky";
}) {
	const accentGlow = accent === "yellow" ? "rgb(252 214 133 / 0.18)" : "rgb(160 207 236 / 0.18)";
	const total = ringSegments.reduce((s, x) => s + x.value, 0) || 1;
	return (
		<section
			className="relative overflow-hidden rounded-2xl border border-border-subtle p-5 flex flex-col justify-between gap-4 min-h-[244px]"
			style={{
				background: `radial-gradient(440px 240px at 14% 120%, rgb(124 92 255 / 0.4), transparent 60%), radial-gradient(360px 200px at 92% -30%, ${accentGlow}, transparent 60%), linear-gradient(120deg, #191330, #120f22 55%, #0e1320)`,
			}}
		>
			<div className="relative z-10 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="layer-eyebrow text-accent-200">{eyebrow}</p>
					<p className="text-2xl font-extralight tracking-tight mt-1">{headline}</p>
					<p className="text-small text-text-secondary">{context}</p>
				</div>
				<DonutChart
					size={84}
					segments={
						ringSegments.map((s) => ({ value: s.value, color: s.color, label: "" })) as never
					}
					centerLabel={
						<span className="flex flex-col items-center leading-none">
							<span className="text-body font-light">{ringCenter}</span>
							<span className="text-[8px] uppercase tracking-wide text-text-tertiary mt-0.5">
								{ringSub}
							</span>
						</span>
					}
				/>
			</div>

			<div className="relative z-10">
				<div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
					{ringSegments.map((s, i) => (
						<span
							key={`${s.color}-${i}`}
							className={cn("rounded-sm", SEG_BG[s.color])}
							style={{ flex: Math.max(s.value, 0.0001) / total }}
						/>
					))}
				</div>
				<div className="grid grid-cols-3 gap-2 mt-2.5">
					{tiles.map((t) => (
						<div
							key={t.label}
							className="rounded-xl border border-border-subtle bg-surface-elevated/30 px-2.5 py-2"
						>
							<div
								className={cn("text-lg font-light tabular-nums leading-none", TILE_TEXT[t.tone])}
							>
								{t.n}
							</div>
							<div className="text-[9px] uppercase tracking-wide text-text-tertiary mt-1 flex items-center gap-1.5">
								<span className={cn("size-1.5 rounded-full", DOT[t.tone])} />
								{t.label}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="relative z-10 flex items-center gap-2.5">
				<div className="flex-1 flex items-center gap-2 text-[11px] rounded-xl border border-border-subtle bg-surface-elevated/30 px-2.5 py-2">
					{nextUp}
				</div>
				{action}
			</div>
		</section>
	);
}
