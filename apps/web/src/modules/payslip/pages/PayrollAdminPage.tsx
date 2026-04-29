import { useCallback, useEffect, useRef, useState } from "react";

import { StatusPill } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";

import {
	type PayrollPeriod,
	type PayrollRun,
	type UploadResult,
	payslipApi,
} from "../api";

function formatPeriodLabel(p: PayrollPeriod): string {
	const fmt = (iso: string) => {
		const d = new Date(iso);
		return d.toLocaleDateString("en-MY", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	};
	return `${fmt(p.period_start)} – ${fmt(p.period_end)}`;
}

const RUN_STATUS_TONE: Record<
	PayrollRun["status"],
	"mint" | "sky" | "coral" | "yellow"
> = {
	published: "mint",
	validated: "sky",
	failed: "coral",
	draft: "yellow",
};

const RUN_STATUS_LABEL: Record<PayrollRun["status"], string> = {
	published: "Published",
	validated: "Validated",
	failed: "Failed",
	draft: "Draft",
};

const PERIOD_STATUS_TONE: Record<
	PayrollPeriod["status"],
	"lavender" | "mint" | "yellow"
> = {
	locked: "lavender",
	published: "mint",
	draft: "yellow",
};

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

	const selectedPeriodObj = periods.find((p) => p.id === selectedPeriod);

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			<PageHeader breadcrumb="Payroll" title="Payroll Admin" />

			{error && (
				<p role="alert" className="text-coral text-small">
					{error}
				</p>
			)}

			{/* ── Upload CSV ────────────────────────────────────────── */}
			<section className="bg-surface-hover border border-border-subtle rounded-lg p-5 space-y-4">
				<header>
					<h2 className="text-h2 text-text-primary">Upload payroll CSV</h2>
					<p className="text-body text-text-secondary mt-1">
						Select the payroll period and upload a CSV to create a new run.
					</p>
				</header>

				<form onSubmit={handleUpload} className="space-y-4">
					<div>
						<label
							htmlFor="period-select"
							className="block text-label uppercase text-text-tertiary mb-2"
						>
							Payroll period
						</label>
						<div className="flex items-center gap-3 flex-wrap">
							<select
								id="period-select"
								value={selectedPeriod}
								onChange={(e) => setSelectedPeriod(e.target.value)}
								className="border border-border-subtle rounded-md px-3 py-1.5 text-body text-text-primary bg-canvas focus:border-accent-500 focus:outline-none max-w-xs"
							>
								{periods.length === 0 && (
									<option value="">No periods available</option>
								)}
								{periods.map((p) => (
									<option key={p.id} value={p.id}>
										{formatPeriodLabel(p)}
									</option>
								))}
							</select>
							{selectedPeriodObj && (
								<StatusPill
									tone={PERIOD_STATUS_TONE[selectedPeriodObj.status]}
									label={
										selectedPeriodObj.status.charAt(0).toUpperCase() +
										selectedPeriodObj.status.slice(1)
									}
								/>
							)}
						</div>
					</div>

					<div>
						<label
							htmlFor="csv-file"
							className="block text-label uppercase text-text-tertiary mb-2"
						>
							CSV file
						</label>
						<input
							id="csv-file"
							type="file"
							accept=".csv,text/csv"
							ref={fileRef}
							className="text-small text-text-secondary"
						/>
					</div>

					<button
						type="submit"
						disabled={uploading}
						className="bg-accent-500 text-white py-2 px-4 rounded text-sm disabled:opacity-50 hover:bg-accent-600"
					>
						{uploading ? "Uploading…" : "Upload"}
					</button>
				</form>

				{uploadResult && (
					<div className="pt-2 border-t border-border-subtle">
						<p className="text-mint text-small">
							Imported {uploadResult.row_count} row(s). Status:{" "}
							{uploadResult.status}
						</p>
						{uploadResult.errors.length > 0 && (
							<ul className="mt-1 text-coral text-small list-disc list-inside">
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

			{/* ── Recent Runs ────────────────────────────────────────── */}
			<section className="space-y-3">
				<header>
					<h2 className="text-h2 text-text-primary">Recent runs</h2>
					<p className="text-body text-text-secondary mt-1">
						Validated runs can be published to make payslips available.
					</p>
				</header>

				{runs.length === 0 ? (
					<div className="bg-surface-hover border border-border-subtle rounded-lg p-8 text-center">
						<p className="text-text-secondary">No payroll runs yet.</p>
					</div>
				) : (
					<ul className="space-y-2">
						{runs.map((run) => (
							<li
								key={run.id}
								className="bg-surface-hover border border-border-subtle rounded-lg p-4"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-1">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-body text-text-primary font-medium font-mono text-small">
												{run.id.slice(0, 8)}…
											</span>
											<StatusPill
												tone={RUN_STATUS_TONE[run.status]}
												label={RUN_STATUS_LABEL[run.status]}
											/>
											<span className="text-small text-text-tertiary">
												{run.row_count} row{run.row_count !== 1 ? "s" : ""}
											</span>
										</div>
										{run.errors.length > 0 && (
											<ul className="mt-1 text-coral text-small list-disc list-inside">
												{run.errors.slice(0, 3).map((err) => (
													<li key={`run-err-${run.id}-${err.row}`}>
														Row {err.row}: {err.error}
													</li>
												))}
												{run.errors.length > 3 && (
													<li className="text-text-tertiary">
														…and {run.errors.length - 3} more error
														{run.errors.length - 3 !== 1 ? "s" : ""}
													</li>
												)}
											</ul>
										)}
									</div>
									{run.status === "validated" && (
										<button
											type="button"
											onClick={() => handlePublish(run.id)}
											disabled={publishing === run.id}
											className="shrink-0 text-sm bg-mint text-canvas py-1.5 px-3 rounded disabled:opacity-50 hover:bg-mint/90"
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
