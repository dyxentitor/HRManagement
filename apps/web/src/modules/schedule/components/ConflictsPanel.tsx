import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { BulkFillWarning } from "../api";

const RULE_DOT: Record<string, string> = {
	overtime: "bg-coral",
	leave_overlap: "bg-mint",
	coverage_drop: "bg-yellow",
};

/** Surfaces the conflicts the backend computed for the visible range (Phase 2). */
export function ConflictsPanel({ warnings }: { warnings: BulkFillWarning[] }) {
	if (warnings.length === 0) {
		return (
			<section className="glass-surface rounded-2xl px-4 py-3 flex items-center gap-2 text-small text-mint">
				<CheckCircle2 className="size-4" />
				No conflicts — this roster is ready to publish.
			</section>
		);
	}
	return (
		<section className="glass-surface rounded-2xl p-4">
			<div className="flex items-center justify-between mb-2.5">
				<p className="layer-eyebrow flex items-center gap-1.5 text-coral">
					<AlertTriangle className="size-3.5" />
					{warnings.length} conflict{warnings.length === 1 ? "" : "s"} to review
				</p>
				<span className="text-[10px] text-text-tertiary uppercase tracking-wide">validation</span>
			</div>
			<ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
				{warnings.map((w, i) => (
					<li
						key={`${w.rule}-${i}`}
						className="flex items-center gap-2 text-[11px] rounded-lg border border-coral/20 bg-coral/5 px-2.5 py-1.5"
					>
						<span className={`size-1.5 rounded-full shrink-0 ${RULE_DOT[w.rule] ?? "bg-coral"}`} />
						<span className="text-text-secondary truncate">{w.message}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
