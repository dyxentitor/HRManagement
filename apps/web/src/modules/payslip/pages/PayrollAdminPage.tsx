import { useCallback, useEffect, useRef, useState } from "react";

import {
	type PayrollPeriod,
	type PayrollRun,
	type UploadResult,
	payslipApi,
} from "../api";

export default function PayrollAdminPage() {
	const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
	const [runs, setRuns] = useState<PayrollRun[]>([]);
	const [selectedPeriod, setSelectedPeriod] = useState<string>("");
	const [uploading, setUploading] = useState(false);
	const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [publishing, setPublishing] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const refresh = useCallback(async () => {
		setError(null);
		try {
			const [p, r] = await Promise.all([
				payslipApi.listPeriods(),
				payslipApi.listRuns(),
			]);
			setPeriods(p);
			setRuns(r);
			if (p.length > 0 && !selectedPeriod) {
				setSelectedPeriod(p[0].id);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load data");
		}
	}, [selectedPeriod]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleUpload(e: React.FormEvent) {
		e.preventDefault();
		const file = fileRef.current?.files?.[0];
		if (!file) {
			setError("Please select a CSV file.");
			return;
		}
		if (!selectedPeriod) {
			setError("Please select a payroll period.");
			return;
		}
		setUploading(true);
		setError(null);
		setUploadResult(null);
		try {
			const result = await payslipApi.uploadRun(selectedPeriod, file);
			setUploadResult(result);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Upload failed");
		} finally {
			setUploading(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	async function handlePublish(runId: string) {
		setPublishing(runId);
		setError(null);
		try {
			const result = await payslipApi.publish(runId);
			alert(`Published ${result.published} payslip(s).`);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Publish failed");
		} finally {
			setPublishing(null);
		}
	}

	return (
		<div className="space-y-6 max-w-4xl">
			<h1 className="text-2xl font-bold">Payroll Admin</h1>
			{error && (
				<p role="alert" className="text-coral">
					{error}
				</p>
			)}

			{/* Upload CSV */}
			<section className="bg-surface border border-border-subtle rounded p-4 space-y-3">
				<h2 className="text-lg font-semibold">Upload Payroll CSV</h2>
				<form onSubmit={handleUpload} className="space-y-3">
					<div>
						<label
							htmlFor="period-select"
							className="block text-sm font-medium mb-1"
						>
							Payroll Period
						</label>
						<select
							id="period-select"
							value={selectedPeriod}
							onChange={(e) => setSelectedPeriod(e.target.value)}
							className="border border-border-subtle rounded px-2 py-1 text-sm w-full max-w-xs bg-canvas text-text-primary focus:border-accent-500 focus:outline-none"
						>
							{periods.length === 0 && (
								<option value="">No periods available</option>
							)}
							{periods.map((p) => (
								<option key={p.id} value={p.id}>
									{p.period_start} – {p.period_end} ({p.status})
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="csv-file"
							className="block text-sm font-medium mb-1"
						>
							CSV File
						</label>
						<input
							id="csv-file"
							type="file"
							accept=".csv,text/csv"
							ref={fileRef}
							className="text-sm"
						/>
					</div>
					<button
						type="submit"
						disabled={uploading}
						className="bg-accent-500 text-white py-1.5 px-4 rounded text-sm disabled:opacity-50 hover:bg-accent-600"
					>
						{uploading ? "Uploading…" : "Upload"}
					</button>
				</form>
				{uploadResult && (
					<div className="mt-2 text-sm">
						<p className="text-mint">
							Imported {uploadResult.row_count} row(s). Status:{" "}
							{uploadResult.status}
						</p>
						{uploadResult.errors.length > 0 && (
							<ul className="mt-1 text-coral list-disc list-inside">
								{uploadResult.errors.map((err) => (
									<li key={`upload-err-${err.row}`}>
										Row {err.row}: {err.error}
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</section>

			{/* Recent Runs */}
			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Recent Runs</h2>
				{runs.length === 0 ? (
					<p className="text-text-secondary text-sm">No runs yet.</p>
				) : (
					<ul className="space-y-2">
						{runs.map((run) => (
							<li
								key={run.id}
								className="bg-surface border border-border-subtle rounded p-3"
							>
								<div className="flex items-start justify-between">
									<div className="text-sm">
										<div className="font-semibold">
											Run {run.id.slice(0, 8)}… •{" "}
											<span
												className={
													run.status === "published"
														? "text-mint"
														: run.status === "validated"
															? "text-sky"
															: run.status === "failed"
																? "text-coral"
																: "text-text-secondary"
												}
											>
												{run.status}
											</span>
										</div>
										<div className="text-text-secondary">
											{run.row_count} row(s) •{" "}
											{run.errors.length > 0
												? `${run.errors.length} error(s)`
												: "no errors"}
										</div>
										{run.errors.length > 0 && (
											<ul className="mt-1 text-coral text-xs list-disc list-inside">
												{run.errors.slice(0, 3).map((err) => (
													<li key={`run-err-${run.id}-${err.row}`}>
														Row {err.row}: {err.error}
													</li>
												))}
												{run.errors.length > 3 && (
													<li>… and {run.errors.length - 3} more</li>
												)}
											</ul>
										)}
									</div>
									{run.status === "validated" && (
										<button
											type="button"
											onClick={() => handlePublish(run.id)}
											disabled={publishing === run.id}
											className="text-sm bg-mint text-canvas py-1 px-3 rounded disabled:opacity-50 hover:bg-mint/90"
										>
											{publishing === run.id ? "Publishing…" : "Publish"}
										</button>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
