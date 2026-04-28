import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type {
	ExportJob,
	ReportFilter,
	ReportRunResult,
	ReportSchema,
} from "../api";
import { reportsApi } from "../api";

function FilterInput({
	filter,
	value,
	onChange,
}: {
	filter: ReportFilter;
	value: string;
	onChange: (v: string) => void;
}) {
	const base = "border rounded px-2 py-1 text-sm w-full";
	if (filter.type === "select" && filter.options?.length) {
		return (
			<select
				className={base}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">All</option>
				{filter.options.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</select>
		);
	}
	return (
		<input
			className={base}
			type={
				filter.type === "date"
					? "date"
					: filter.type === "number"
						? "number"
						: "text"
			}
			placeholder={filter.label}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}

function ExportPanel({
	code,
	filters,
	exporters,
}: {
	code: string;
	filters: Record<string, string>;
	exporters: string[];
}) {
	const [jobs, setJobs] = useState<Record<string, ExportJob>>({});
	const [exporting, setExporting] = useState<string | null>(null);
	const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

	function stopPoll(fmt: string) {
		if (pollRefs.current[fmt]) {
			clearInterval(pollRefs.current[fmt]);
			delete pollRefs.current[fmt];
		}
	}

	async function startExport(fmt: string) {
		setExporting(fmt);
		try {
			const { job_id } = await reportsApi.export(code, filters, fmt);
			// Poll until done/failed
			const interval = setInterval(async () => {
				const job = await reportsApi.pollJob(job_id);
				setJobs((j) => ({ ...j, [fmt]: job }));
				if (job.status === "done" || job.status === "failed") {
					stopPoll(fmt);
					setExporting(null);
				}
			}, 2000);
			pollRefs.current[fmt] = interval;
		} catch {
			setExporting(null);
		}
	}

	return (
		<div className="flex gap-2 items-center flex-wrap">
			<span className="text-xs text-slate-500 font-medium">Export:</span>
			{exporters.map((fmt) => {
				const job = jobs[fmt];
				if (job?.status === "done" && job.download_url) {
					return (
						<a
							key={fmt}
							href={job.download_url}
							target="_blank"
							rel="noreferrer"
							className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
						>
							Download {fmt.toUpperCase()}
						</a>
					);
				}
				if (job?.status === "running" || exporting === fmt) {
					return (
						<span
							key={fmt}
							className="text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded"
						>
							{fmt.toUpperCase()} processing…
						</span>
					);
				}
				if (job?.status === "failed") {
					return (
						<button
							key={fmt}
							type="button"
							onClick={() => startExport(fmt)}
							className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
						>
							Retry {fmt.toUpperCase()}
						</button>
					);
				}
				return (
					<button
						key={fmt}
						type="button"
						disabled={!!exporting}
						onClick={() => startExport(fmt)}
						className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
					>
						{fmt.toUpperCase()}
					</button>
				);
			})}
		</div>
	);
}

export default function ReportRunPage() {
	const { code } = useParams<{ code: string }>();
	const [schema, setSchema] = useState<ReportSchema | null>(null);
	const [filters, setFilters] = useState<Record<string, string>>({});
	const [result, setResult] = useState<ReportRunResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [schemaError, setSchemaError] = useState<string | null>(null);
	const [page, setPage] = useState(1);

	useEffect(() => {
		if (!code) return;
		reportsApi
			.schema(code)
			.then((s) => {
				setSchema(s);
				const init: Record<string, string> = {};
				for (const f of s.filters) init[f.field] = "";
				setFilters(init);
			})
			.catch((e: Error) => setSchemaError(e.message));
	}, [code]);

	async function runReport(p = 1) {
		if (!code) return;
		setLoading(true);
		try {
			const r = await reportsApi.run(code, filters, p);
			setResult(r);
			setPage(p);
		} finally {
			setLoading(false);
		}
	}

	if (schemaError)
		return (
			<div className="p-6 text-red-600">
				Error loading report schema: {schemaError}
			</div>
		);
	if (!schema) return <div className="p-6 text-slate-500">Loading schema…</div>;

	const totalPages = result ? Math.ceil(result.total / result.page_size) : 0;

	return (
		<div className="p-6 max-w-screen-xl">
			<div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
				<Link to="/reports" className="hover:underline">
					Reports
				</Link>
				<span>/</span>
				<span className="text-slate-800">{schema.title}</span>
			</div>

			<h1 className="text-xl font-semibold mb-4">{schema.title}</h1>

			{/* Filters */}
			{schema.filters.length > 0 && (
				<div className="bg-slate-50 border rounded-lg p-4 mb-4">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{schema.filters.map((f) => (
							<div key={f.field}>
								<label className="block text-xs font-medium text-slate-600 mb-1">
									{f.label}
								</label>
								<FilterInput
									filter={f}
									value={filters[f.field] ?? ""}
									onChange={(v) =>
										setFilters((prev) => ({ ...prev, [f.field]: v }))
									}
								/>
							</div>
						))}
					</div>
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							onClick={() => runReport(1)}
							disabled={loading}
							className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
						>
							{loading ? "Running…" : "Run Report"}
						</button>
					</div>
				</div>
			)}

			{schema.filters.length === 0 && (
				<div className="mb-4">
					<button
						type="button"
						onClick={() => runReport(1)}
						disabled={loading}
						className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
					>
						{loading ? "Running…" : "Run Report"}
					</button>
				</div>
			)}

			{/* Export */}
			{result && schema.exporters.length > 0 && (
				<div className="mb-4">
					<ExportPanel
						code={schema.code}
						filters={filters}
						exporters={schema.exporters}
					/>
				</div>
			)}

			{/* Results */}
			{result && (
				<>
					<div className="text-sm text-slate-500 mb-2">
						{result.total.toLocaleString()} rows
					</div>

					<div className="overflow-x-auto border rounded-lg">
						<table className="text-sm w-full">
							<thead>
								<tr className="bg-slate-50 border-b">
									{schema.columns.map((col) => (
										<th
											key={col.field}
											className="text-left px-3 py-2 font-medium text-slate-700 whitespace-nowrap"
										>
											{col.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{result.rows.map((row, i) => (
									<tr
										// biome-ignore lint/suspicious/noArrayIndexKey: report rows have no stable ID
										key={i}
										className="border-b last:border-0 hover:bg-slate-50"
									>
										{schema.columns.map((col) => (
											<td
												key={col.field}
												className="px-3 py-2 text-slate-700 whitespace-nowrap"
											>
												{row[col.field] ?? "—"}
											</td>
										))}
									</tr>
								))}
								{result.rows.length === 0 && (
									<tr>
										<td
											colSpan={schema.columns.length}
											className="px-3 py-4 text-center text-slate-400"
										>
											No results
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="flex gap-2 mt-4 items-center text-sm">
							<button
								type="button"
								disabled={page <= 1}
								onClick={() => runReport(page - 1)}
								className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-slate-50"
							>
								← Prev
							</button>
							<span className="text-slate-500">
								Page {page} of {totalPages}
							</span>
							<button
								type="button"
								disabled={page >= totalPages}
								onClick={() => runReport(page + 1)}
								className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-slate-50"
							>
								Next →
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
