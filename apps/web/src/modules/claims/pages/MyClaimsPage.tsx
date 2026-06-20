import { useCallback, useEffect, useState } from "react";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { type ClaimCategory, type ClaimRequest, claimsApi } from "../api";
import { ClaimActivityTimeline } from "../components/ClaimActivityTimeline";
import { ClaimCategoryGrid } from "../components/ClaimCategoryGrid";
import { ClaimStatusTiles } from "../components/ClaimStatusTiles";
import { ClaimsHero } from "../components/ClaimsHero";
import { InProgressClaims } from "../components/InProgressClaims";
import { STATUS_LABEL, STATUS_TONE, fmtDate, fmtMoney, num } from "../lib/claim-ui";

export default function MyClaimsPage() {
	const [claims, setClaims] = useState<ClaimRequest[]>([]);
	const [categories, setCategories] = useState<ClaimCategory[]>([]);
	const [selected, setSelected] = useState<ClaimRequest | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const c = await claimsApi.listMine();
			setClaims(c);
			try {
				setCategories(await claimsApi.listCategories());
			} catch {
				setCategories([]);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load claims");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function onCancel(id: string) {
		try {
			await claimsApi.cancel(id);
			setSelected(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Cancel failed");
		}
	}

	const canCancel = selected && (selected.status === "draft" || selected.status === "submitted");

	if (loading) {
		return (
			<div className="space-y-5">
				<Skeleton className="h-44 rounded-2xl" />
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
					{["a", "b", "c", "d"].map((k) => (
						<Skeleton key={k} className="h-28 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-64 rounded-2xl" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<ClaimsHero claims={claims} onAddReceipt={setSelected} />

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			<ClaimStatusTiles claims={claims} />

			<div className="grid lg:grid-cols-[1.55fr_1fr] gap-6 items-start">
				<InProgressClaims claims={claims} onSelect={setSelected} />
				<ClaimActivityTimeline claims={claims} />
			</div>

			<ClaimCategoryGrid categories={categories} />

			<DetailPanel
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? `Claim · ${selected.category_code}` : "Claim"}
				footer={
					canCancel ? (
						<Button
							type="button"
							variant="outline"
							className="w-full border-coral/30 text-coral hover:bg-coral/10"
							onClick={() => selected && onCancel(selected.id)}
						>
							Cancel claim
						</Button>
					) : null
				}
			>
				{selected && (
					<dl className="grid grid-cols-[110px_1fr] gap-y-2 text-body">
						<dt className="text-label uppercase text-text-tertiary self-center">Category</dt>
						<dd>{selected.category_code}</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">Amount</dt>
						<dd className="tabular-nums">
							{fmtMoney(num(selected.amount), selected.currency_code)}
						</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">Date</dt>
						<dd>{fmtDate(selected.expense_date)}</dd>
						{selected.merchant && (
							<>
								<dt className="text-label uppercase text-text-tertiary self-center">Merchant</dt>
								<dd>{selected.merchant}</dd>
							</>
						)}
						<dt className="text-label uppercase text-text-tertiary self-center">Status</dt>
						<dd>
							<StatusPill
								tone={STATUS_TONE[selected.status]}
								label={STATUS_LABEL[selected.status]}
							/>
						</dd>
						{selected.description && (
							<>
								<dt className="text-label uppercase text-text-tertiary self-start">Description</dt>
								<dd>{selected.description}</dd>
							</>
						)}
						<dt className="text-label uppercase text-text-tertiary self-center">Receipts</dt>
						<dd>{selected.attachments.length} attached</dd>
					</dl>
				)}
			</DetailPanel>
		</div>
	);
}
