import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import { type PayslipRecord, payslipApi } from "../api";

type PayslipStatus = PayslipRecord["status"];

const STATUS_TONE: Record<PayslipStatus, "yellow" | "mint"> = {
	draft: "yellow",
	published: "mint",
	sent: "mint",
};

const STATUS_LABEL: Record<PayslipStatus, string> = {
	draft: "Draft",
	published: "Published",
	sent: "Sent",
};

function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

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
		refresh();
	}, [refresh]);

	async function openPdf(id: string) {
		try {
			const ps = await payslipApi.retrieve(id);
			if (ps.pdf_url) {
				window.open(ps.pdf_url, "_blank");
			} else {
				setError("PDF not yet available for this payslip.");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to fetch payslip");
		}
	}

	if (loading)
		return <p className="text-text-tertiary p-4">Loading payslips…</p>;

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader breadcrumb="Payslips" title="My Payslips" />

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{payslips.length === 0 ? (
				<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
					<p className="text-text-secondary">No payslips available yet.</p>
				</div>
			) : (
				<ul className="space-y-3">
					{payslips.map((ps) => {
						const isPublished =
							ps.status === "published" || ps.status === "sent";
						return (
							<li
								key={ps.id}
								className="bg-surface-hover border border-border-subtle rounded-lg p-4"
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<div className="flex items-center gap-2 mb-1">
											<span className="text-body text-text-primary font-semibold">
												{ps.currency_code} {ps.net}
											</span>
											<span className="text-small text-text-tertiary">
												(gross {ps.gross})
											</span>
										</div>
										<div className="flex items-center gap-2 text-small text-text-secondary">
											<StatusPill
												tone={STATUS_TONE[ps.status]}
												label={STATUS_LABEL[ps.status]}
											/>
											{isPublished && (
												<span>Published {formatDate(ps.published_at)}</span>
											)}
										</div>
									</div>
									{isPublished && (
										<button
											type="button"
											onClick={() => openPdf(ps.id)}
											className="bg-accent-500 text-white py-1.5 px-3 rounded text-sm hover:bg-accent-600"
										>
											View PDF
										</button>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
