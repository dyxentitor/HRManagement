import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { type Claim, incentiveApi } from "../api";

function timeAgo(iso: string): string {
	const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	return `${Math.floor(h / 24)}d`;
}

/** The pending-claim action centre. Calls back when a claim is reviewed so the page refetches KPIs. */
export function ApprovalQueue({ onReviewed }: { onReviewed: () => void }) {
	const [pending, setPending] = useState<Claim[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(async () => {
		const claims = await incentiveApi.claims.list().catch(() => []);
		setPending(claims.filter((c) => c.status === "pending"));
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function review(c: Claim, approve: boolean) {
		setBusy(c.id);
		try {
			if (approve) {
				await incentiveApi.claims.approve(c.id);
				toast.success("Claim approved.");
			} else {
				await incentiveApi.claims.reject(c.id, "");
				toast.success("Claim rejected.");
			}
			await load();
			onReviewed();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Review failed.");
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="glass-surface rounded-2xl p-4" style={{ borderColor: "rgba(247,138,138,.22)" }}>
			<h3 className="text-body font-semibold mb-3 flex items-center justify-between">
				Approval queue
				{pending && pending.length > 0 && (
					<span className="text-[10px] font-semibold text-coral bg-coral/15 rounded-full px-2 py-0.5">
						{pending.length} pending
					</span>
				)}
			</h3>
			{pending === null ? (
				<p className="text-small text-text-tertiary">Loading…</p>
			) : pending.length === 0 ? (
				<p className="text-small text-text-tertiary py-3">All caught up — nothing to review. 🎉</p>
			) : (
				<div className="space-y-1">
					{pending.map((c) => (
						<div
							key={c.id}
							className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0"
						>
							<div className="flex-1 min-w-0">
								<p className="text-small text-text-primary truncate">
									{c.mandays} md · {c.project_name}
								</p>
								<p className="text-[10px] text-text-tertiary">{timeAgo(c.created_at)} ago</p>
							</div>
							<Button
								type="button"
								size="sm"
								disabled={busy === c.id}
								onClick={() => review(c, true)}
								className="bg-accent-500 text-white"
							>
								Approve
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={busy === c.id}
								onClick={() => review(c, false)}
							>
								✕
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
