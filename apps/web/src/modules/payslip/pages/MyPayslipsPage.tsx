import { useCallback, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { type PayslipRecord, payslipApi } from "../api";
import { PayslipBreakdown } from "../components/PayslipBreakdown";
import { PayslipHero } from "../components/PayslipHero";
import { PayslipHistory } from "../components/PayslipHistory";
import { isPublished, sortNewestFirst, yearSummary } from "../lib/payslip-ui";

export default function MyPayslipsPage() {
	const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setPayslips(await payslipApi.listMine());
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load payslips");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function onDownload(p: PayslipRecord) {
		try {
			const url = p.pdf_url ?? (await payslipApi.retrieve(p.id)).pdf_url;
			if (url) window.open(url, "_blank", "noopener,noreferrer");
			else setError("PDF not yet available for this payslip.");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to fetch payslip");
		}
	}

	// the latest payslip shown in the hero/breakdown — prefer a published one
	const latest = useMemo(() => {
		const sorted = sortNewestFirst(payslips);
		return sorted.find(isPublished) ?? sorted[0] ?? null;
	}, [payslips]);

	const ytd = useMemo(() => {
		const year = latest?.period_start
			? new Date(`${latest.period_start.slice(0, 10)}T00:00:00Z`).getUTCFullYear()
			: new Date().getUTCFullYear();
		return yearSummary(payslips, year);
	}, [payslips, latest]);

	if (loading) {
		return (
			<div className="space-y-5">
				<Skeleton className="h-44 rounded-2xl" />
				<Skeleton className="h-64 rounded-2xl" />
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{latest === null ? (
				<div className="glass-surface rounded-2xl p-10 text-center text-text-tertiary">
					No payslips yet. They'll appear here once payroll publishes them.
				</div>
			) : (
				<>
					<PayslipHero latest={latest} ytd={ytd} onDownload={onDownload} />
					<div className="grid lg:grid-cols-[1fr_1.3fr] gap-5 items-start">
						<PayslipBreakdown payslip={latest} />
						<PayslipHistory payslips={payslips} onDownload={onDownload} />
					</div>
				</>
			)}
		</div>
	);
}
