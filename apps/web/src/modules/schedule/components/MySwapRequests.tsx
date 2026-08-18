import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";

import { type SwapRequest, cancelSwapRequest, listMySwapRequests } from "../swap-api";

const TONE: Record<SwapRequest["status"], "yellow" | "mint" | "coral" | "sky"> = {
	pending: "yellow",
	approved: "mint",
	rejected: "coral",
	cancelled: "sky",
};

function slot(a: SwapRequest["requester_assignment"]): string {
	const d = new Date(`${a.work_date}T00:00:00Z`).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	return `${d} · ${a.shift_name}`;
}

export function MySwapRequests({
	refreshKey,
	onChanged,
}: {
	refreshKey: number;
	onChanged: () => void;
}) {
	const [rows, setRows] = useState<SwapRequest[]>([]);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(() => {
		listMySwapRequests()
			.then(setRows)
			.catch(() => setRows([]));
	}, []);

	useEffect(() => {
		load();
	}, [load, refreshKey]);

	async function cancel(id: string) {
		setBusy(id);
		try {
			await cancelSwapRequest(id);
			onChanged();
			load();
		} finally {
			setBusy(null);
		}
	}

	if (rows.length === 0) return null;

	return (
		<section className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h2 className="text-h2 text-text-primary mb-3">My swap requests</h2>
			<ul className="space-y-2">
				{rows.map((r) => (
					<li
						key={r.id}
						className="flex items-center gap-3 text-small text-text-secondary"
					>
						<StatusPill tone={TONE[r.status]} label={r.status} />
						<span className="text-text-primary">
							{slot(r.requester_assignment)} → {slot(r.counterparty_assignment)}
						</span>
						<span>with {r.counterparty_name}</span>
						{r.status === "pending" && (
							<button
								type="button"
								onClick={() => cancel(r.id)}
								disabled={busy === r.id}
								className="ml-auto text-coral hover:text-coral/80 disabled:opacity-50"
							>
								Cancel
							</button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
