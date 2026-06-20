import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { type ClaimCategory, type ClaimRequest, claimsApi } from "../api";
import { ClaimActivityFeed } from "../components/ClaimActivityFeed";
import { ClaimCategoryGrid } from "../components/ClaimCategoryGrid";
import { ClaimSummaryCards } from "../components/ClaimSummaryCards";
import { HowClaimsWork } from "../components/HowClaimsWork";
import { RecentClaimsList } from "../components/RecentClaimsList";
import { STATUS_LABEL, STATUS_TONE, fmtDate, fmtMoney, num, summarise } from "../lib/claim-ui";

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

	const heroLine = useMemo(() => {
		if (claims.length === 0)
			return "Submit your first claim and track it through to payment.";
		const s = summarise(claims);
		const inFlight = s.pending.amount + s.approved.amount;
		const waiting = s.pending.count + s.approved.count;
		if (waiting === 0) return "All your claims are settled. Nothing in flight.";
		return `${waiting} claim${waiting === 1 ? "" : "s"} in progress · ${fmtMoney(inFlight, s.pending.currency)} awaiting payment.`;
	}, [claims]);

	const canCancel = selected && (selected.status === "draft" || selected.status === "submitted");

	if (loading) {
		return (
			<div className="space-y-5">
				<Skeleton className="h-24 rounded-xl" />
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					{["a", "b", "c", "d"].map((k) => (
						<Skeleton key={k} className="h-20 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-64 rounded-xl" />
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{/* Hero */}
			<section className="glass-surface rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-h1 text-text-primary">My Claims</h1>
					<p className="text-small text-text-secondary mt-1">{heroLine}</p>
				</div>
				<Button asChild className="soft-glow rounded-xl">
					<Link to="/claims/submit">
						<Plus className="size-4 mr-1" /> Submit a claim
					</Link>
				</Button>
			</section>

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			<ClaimSummaryCards claims={claims} />

			<div className="grid lg:grid-cols-2 gap-4 items-start">
				<div className="space-y-4">
					<ClaimCategoryGrid categories={categories} />
					<HowClaimsWork />
				</div>
				<div className="space-y-4">
					<RecentClaimsList claims={claims} onSelect={setSelected} />
					<ClaimActivityFeed claims={claims} />
				</div>
			</div>

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
						<dd className="tabular-nums">{fmtMoney(num(selected.amount), selected.currency_code)}</dd>
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
							<StatusPill tone={STATUS_TONE[selected.status]} label={STATUS_LABEL[selected.status]} />
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
