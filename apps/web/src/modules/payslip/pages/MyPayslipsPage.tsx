import { useCallback, useEffect, useState } from "react";

import { type PayslipRecord, payslipApi } from "../api";

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

	if (loading) return <p>Loading…</p>;

	return (
		<div className="space-y-4 max-w-4xl">
			<h1 className="text-2xl font-bold">My Payslips</h1>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{payslips.length === 0 ? (
				<p className="text-slate-500">No payslips available yet.</p>
			) : (
				<ul className="space-y-2">
					{payslips.map((ps) => (
						<li key={ps.id} className="bg-white border rounded p-3">
							<div className="flex items-center justify-between">
								<div className="text-sm">
									<div className="font-semibold">
										{ps.currency_code} {ps.net}{" "}
										<span className="text-slate-500 font-normal">
											(gross {ps.gross})
										</span>
									</div>
									<div className="text-slate-600">
										{ps.status === "published" || ps.status === "sent"
											? `Published ${ps.published_at?.slice(0, 10) ?? ""}`
											: "Draft"}
									</div>
								</div>
								{(ps.status === "published" || ps.status === "sent") && (
									<button
										type="button"
										onClick={() => openPdf(ps.id)}
										className="text-sm bg-slate-900 text-white py-1 px-3 rounded"
									>
										View PDF
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
