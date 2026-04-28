import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type ReportSummary, reportsApi } from "../api";

function groupByModule(reports: ReportSummary[]) {
	const groups: Record<string, ReportSummary[]> = {};
	for (const r of reports) {
		const prefix = r.code.split(".")[0];
		if (!groups[prefix]) groups[prefix] = [];
		groups[prefix].push(r);
	}
	return groups;
}

export default function ReportsListPage() {
	const [reports, setReports] = useState<ReportSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		reportsApi
			.list()
			.then(setReports)
			.catch((e: Error) => setError(e.message))
			.finally(() => setLoading(false));
	}, []);

	if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
	if (error) return <div className="p-6 text-red-600">{error}</div>;

	const groups = groupByModule(reports);

	return (
		<div className="p-6 max-w-4xl">
			<h1 className="text-xl font-semibold mb-6">Reports</h1>
			{Object.entries(groups).map(([module, items]) => (
				<div key={module} className="mb-8">
					<h2 className="text-sm font-semibold uppercase text-slate-500 tracking-wide mb-3">
						{module}
					</h2>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{items.map((r) => (
							<Link
								key={r.code}
								to={`/reports/${r.code}`}
								className="block border rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all"
							>
								<div className="font-medium text-slate-800">{r.title}</div>
								<div className="text-xs text-slate-500 mt-1">
									{r.exporters.join(" · ")}
								</div>
							</Link>
						))}
					</div>
				</div>
			))}
			{reports.length === 0 && (
				<p className="text-slate-500">No reports available.</p>
			)}
		</div>
	);
}
