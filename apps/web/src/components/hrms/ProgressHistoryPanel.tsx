import { Fragment, type ReactNode, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface ProgressHistoryPanelProps<T> {
	items: T[];
	/** Which items are still moving through their flow (shown as rich cards). */
	isInFlight: (item: T) => boolean;
	getKey: (item: T) => string;
	/** Sort value; newest-first (descending) ordering is applied. */
	sortValue: (item: T) => string;
	/** Rich card for an in-flight item. */
	renderCard: (item: T) => ReactNode;
	/** Compact one-line row for the (bounded, scrollable) history list. */
	renderRow: (item: T) => ReactNode;
	cardLimit?: number;
	emptyInProgress?: string;
	emptyHistory?: string;
}

/**
 * Bounded "In progress / History" section. In-progress shows up to `cardLimit`
 * rich cards; History shows every item as compact rows inside a fixed-height,
 * internally-scrolling panel — so the page never grows tall as items accumulate.
 */
export function ProgressHistoryPanel<T>({
	items,
	isInFlight,
	getKey,
	sortValue,
	renderCard,
	renderRow,
	cardLimit = 2,
	emptyInProgress = "Nothing awaiting you. You're all caught up. 🎉",
	emptyHistory = "Nothing here yet.",
}: ProgressHistoryPanelProps<T>) {
	const [tab, setTab] = useState<"progress" | "history">("progress");

	const sorted = useMemo(
		() => [...items].sort((a, b) => sortValue(b).localeCompare(sortValue(a))),
		[items, sortValue],
	);
	const inFlight = useMemo(() => sorted.filter(isInFlight), [sorted, isInFlight]);
	const cards = inFlight.slice(0, cardLimit);
	const extra = inFlight.length - cards.length;

	function tabBtn(key: "progress" | "history", label: string) {
		return (
			<button
				type="button"
				onClick={() => setTab(key)}
				className={cn(
					"px-2.5 py-1 rounded-full",
					tab === key ? "bg-accent-500/15 text-text-primary" : "text-text-tertiary",
				)}
			>
				{label}
			</button>
		);
	}

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<p className="layer-eyebrow">
					{tab === "progress" ? `In progress · ${inFlight.length}` : `History · ${items.length}`}
				</p>
				<div className="flex gap-1 text-small">
					{tabBtn("progress", "In progress")}
					{tabBtn("history", "History")}
				</div>
			</div>

			{tab === "progress" ? (
				inFlight.length === 0 ? (
					<div className="glass-surface rounded-2xl p-8 text-center text-text-tertiary">
						{emptyInProgress}
					</div>
				) : (
					<>
						<div className="grid sm:grid-cols-2 gap-3">
							{cards.map((c) => (
								<Fragment key={getKey(c)}>{renderCard(c)}</Fragment>
							))}
						</div>
						{extra > 0 && (
							<button
								type="button"
								onClick={() => setTab("history")}
								className="mt-3 text-small text-accent-200"
							>
								+{extra} more in history →
							</button>
						)}
					</>
				)
			) : items.length === 0 ? (
				<div className="glass-surface rounded-2xl p-8 text-center text-text-tertiary">
					{emptyHistory}
				</div>
			) : (
				<div className="glass-surface rounded-2xl p-1.5 max-h-72 overflow-y-auto">
					{sorted.map((it) => (
						<Fragment key={getKey(it)}>{renderRow(it)}</Fragment>
					))}
				</div>
			)}
		</section>
	);
}
