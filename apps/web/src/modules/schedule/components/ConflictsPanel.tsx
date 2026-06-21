import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { BulkFillWarning } from "../api";

const RULE_DOT: Record<string, string> = {
	overtime: "bg-coral",
	leave_overlap: "bg-mint",
	coverage_drop: "bg-yellow",
};

const RULE_LABEL: Record<string, string> = {
	overtime: "overtime",
	leave_overlap: "leave clash",
	coverage_drop: "coverage",
};

/** Compact, collapsible conflicts bar for the visible range (Phase 2). */
export function ConflictsPanel({ warnings }: { warnings: BulkFillWarning[] }) {
	const [open, setOpen] = useState(false);

	if (warnings.length === 0) {
		return (
			<section className="glass-surface rounded-xl px-3 py-2 flex items-center gap-2 text-small text-mint">
				<CheckCircle2 className="size-4" />
				No conflicts — ready to publish.
			</section>
		);
	}

	const counts = warnings.reduce<Record<string, number>>((acc, w) => {
		acc[w.rule] = (acc[w.rule] ?? 0) + 1;
		return acc;
	}, {});

	return (
		<section className="glass-surface rounded-xl">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="w-full flex items-center gap-3 px-3 py-2 text-left"
			>
				<AlertTriangle className="size-4 text-coral shrink-0" />
				<span className="text-small font-medium text-coral shrink-0">
					{warnings.length} conflict{warnings.length === 1 ? "" : "s"}
				</span>
				<span className="flex items-center gap-2 flex-wrap min-w-0">
					{Object.entries(counts).map(([rule, n]) => (
						<span
							key={rule}
							className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary"
						>
							<span className={cn("size-1.5 rounded-full", RULE_DOT[rule] ?? "bg-coral")} />
							{n} {RULE_LABEL[rule] ?? rule}
						</span>
					))}
				</span>
				<ChevronDown
					className={cn(
						"size-4 text-text-tertiary ml-auto shrink-0 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>
			{open && (
				<ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-1.5 px-3 pb-3 max-h-40 overflow-y-auto">
					{warnings.map((w, i) => (
						<li
							key={`${w.rule}-${i}`}
							className="flex items-center gap-2 text-[11px] rounded-lg border border-coral/20 bg-coral/5 px-2.5 py-1.5"
						>
							<span
								className={cn("size-1.5 rounded-full shrink-0", RULE_DOT[w.rule] ?? "bg-coral")}
							/>
							<span className="text-text-secondary truncate">{w.message}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
