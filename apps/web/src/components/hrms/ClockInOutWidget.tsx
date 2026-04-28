import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export type ClockState =
	| { status: "off" }
	| { status: "in"; since: string }
	| { status: "out"; clockedIn: string; clockedOut: string };

export interface ClockInOutWidgetProps {
	state: ClockState;
	onClockIn: () => void;
	onClockOut: () => void;
	busy?: boolean;
}

function fmtElapsed(sinceIso: string): string {
	const minutes = Math.max(
		0,
		Math.floor((Date.now() - new Date(sinceIso).getTime()) / 60000),
	);
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}h ${m}m`;
}

function fmtClock(date: Date): string {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export function ClockInOutWidget({
	state,
	onClockIn,
	onClockOut,
	busy = false,
}: ClockInOutWidgetProps) {
	const [, setTick] = useState(0);

	useEffect(() => {
		if (state.status !== "in") return;
		const t = setInterval(() => setTick((x) => x + 1), 60000);
		return () => clearInterval(t);
	}, [state.status]);

	const now = new Date();
	const elapsed = state.status === "in" ? fmtElapsed(state.since) : null;

	return (
		<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<div className="flex items-baseline justify-between mb-3">
				<span className="text-label uppercase text-text-tertiary">
					Clock in / out
				</span>
				<span className="font-mono text-h3 text-text-primary">
					{fmtClock(now)}
				</span>
			</div>
			{state.status === "off" && (
				<Button
					type="button"
					onClick={onClockIn}
					disabled={busy}
					className="w-full bg-accent-500 hover:bg-accent-600 text-white h-12 text-h2"
				>
					Clock in
				</Button>
			)}
			{state.status === "in" && (
				<>
					<p className="text-small text-text-secondary mb-2">
						Working for{" "}
						<span className="text-mint font-semibold">{elapsed}</span>
					</p>
					<Button
						type="button"
						onClick={onClockOut}
						disabled={busy}
						variant="outline"
						className="w-full border-coral/30 text-coral hover:bg-coral/10 h-12 text-h2"
					>
						Clock out
					</Button>
				</>
			)}
			{state.status === "out" && (
				<p className="text-body text-text-secondary">
					Done for the day. In:{" "}
					<span className="font-mono">{state.clockedIn}</span> · Out:{" "}
					<span className="font-mono">{state.clockedOut}</span>
				</p>
			)}
		</div>
	);
}
