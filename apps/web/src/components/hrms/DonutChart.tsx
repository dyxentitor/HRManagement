import type { ReactNode } from "react";

export interface DonutSegment {
	value: number;
	color: "mint" | "yellow" | "coral" | "lavender" | "peach" | "sky";
	label: string;
}

export interface DonutChartProps {
	segments: DonutSegment[];
	centerLabel: ReactNode;
	size?: number;
}

const COLOR_HEX: Record<DonutSegment["color"], string> = {
	mint: "#97D9C7",
	yellow: "#FCD685",
	coral: "#F4A0A0",
	lavender: "#BFB1F2",
	peach: "#FCC59A",
	sky: "#A0CFEC",
};

export function DonutChart({
	segments,
	centerLabel,
	size = 90,
}: DonutChartProps) {
	const total = segments.reduce((acc, s) => acc + s.value, 0);
	let cumulative = 0;
	const stops = segments.map((seg) => {
		const startDeg = (cumulative / total) * 360;
		cumulative += seg.value;
		const endDeg = (cumulative / total) * 360;
		return `${COLOR_HEX[seg.color]} ${startDeg}deg ${endDeg}deg`;
	});

	const ringStyle = {
		width: `${size}px`,
		height: `${size}px`,
		background: `conic-gradient(${stops.join(", ")})`,
	};

	const a11yLabel = `Donut chart: ${segments
		.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
		.join(", ")}`;

	return (
		<div className="flex items-center gap-4">
			<div
				className="relative rounded-full shrink-0"
				style={ringStyle}
				aria-label={a11yLabel}
			>
				<div
					className="absolute inset-3.5 rounded-full bg-surface-hover"
					aria-hidden
				/>
				<div className="absolute inset-0 grid place-items-center text-text-primary text-center text-h3 leading-tight">
					{centerLabel}
				</div>
			</div>
			<div className="text-small space-y-1">
				{segments.map((seg, i) => (
					<div
						key={`${seg.color}-${i}`}
						className="flex items-center gap-2 text-text-secondary"
					>
						<span
							className="size-2 rounded-full shrink-0"
							style={{ background: COLOR_HEX[seg.color] }}
							aria-hidden
						/>
						<span>{seg.label}</span>
						<span className="ml-auto text-text-tertiary">
							{Math.round((seg.value / total) * 100)}%
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
