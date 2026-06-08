import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NotLinkedEmptyState } from "@/components/hrms/NotLinkedEmptyState";

import { employeeApi } from "@/modules/employee/api";
import { type LeaveType, leaveApi } from "../api";

export default function LeaveApplyPage() {
	const navigate = useNavigate();
	const [noEmployee, setNoEmployee] = useState<boolean>(false);
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [leaveType, setLeaveType] = useState<string>("");
	const [startDate, setStartDate] = useState<string>("");
	const [endDate, setEndDate] = useState<string>("");
	const [isHalfDay, setIsHalfDay] = useState<boolean>(false);
	const [halfDayPeriod, setHalfDayPeriod] = useState<string>("am");
	const [reason, setReason] = useState<string>("");
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		employeeApi.getMe().then((emp) => {
			if (!emp) {
				setNoEmployee(true);
				return;
			}
			leaveApi
				.listTypes()
				.then(setTypes)
				.catch(() => setError("Failed to load leave types"));
		});
	}, []);

	function diffInDays(start: string, end: string): number {
		if (!start || !end) return 0;
		const a = new Date(start);
		const b = new Date(end);
		const diff = (b.getTime() - a.getTime()) / 86_400_000 + 1;
		return Math.max(0, diff);
	}

	const totalDays = isHalfDay ? 0.5 : diffInDays(startDate, endDate);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const created = await leaveApi.apply({
				leave_type: leaveType,
				start_date: startDate,
				end_date: endDate,
				total_days: String(totalDays),
				is_half_day: isHalfDay,
				half_day_period: isHalfDay ? halfDayPeriod : "",
				reason,
			});
			// Auto-submit immediately. (Future: separate save-as-draft and submit.)
			await leaveApi.submit(created.id);
			navigate("/leave/me");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to apply");
		} finally {
			setSubmitting(false);
		}
	}

	if (noEmployee) {
		return (
			<div className="max-w-xl space-y-4">
				<h1 className="text-2xl font-bold">Apply for Leave</h1>
				<NotLinkedEmptyState scope="leave" />
			</div>
		);
	}

	return (
		<div className="max-w-xl space-y-4">
			<h1 className="text-2xl font-bold">Apply for Leave</h1>
			<form onSubmit={onSubmit} className="space-y-3">
				<Field label="Leave type" required>
					<select
						value={leaveType}
						onChange={(e) => setLeaveType(e.target.value)}
						required
						className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
						aria-label="Leave type"
					>
						<option value="">Select…</option>
						{types.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name} ({t.code})
							</option>
						))}
					</select>
				</Field>

				<div>
					<span className="block text-sm text-text-secondary mb-1">
						Duration
					</span>
					<div className="flex gap-4 text-sm">
						<label className="flex items-center gap-2">
							<input
								type="radio"
								name="duration"
								aria-label="Full day"
								checked={!isHalfDay}
								onChange={() => setIsHalfDay(false)}
							/>
							Full day
						</label>
						<label className="flex items-center gap-2">
							<input
								type="radio"
								name="duration"
								aria-label="Half day"
								checked={isHalfDay}
								onChange={() => {
									setIsHalfDay(true);
									setEndDate(startDate);
								}}
							/>
							Half day
						</label>
					</div>
				</div>

				{isHalfDay ? (
					<>
						<Field label="Date" required>
							<input
								type="date"
								aria-label="Date"
								value={startDate}
								onChange={(e) => {
									setStartDate(e.target.value);
									setEndDate(e.target.value);
								}}
								required
								className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</Field>
						<div>
							<span className="block text-sm text-text-secondary mb-1">
								Period <span className="text-coral">*</span>
							</span>
							<div className="flex gap-4 text-sm">
								<label className="flex items-center gap-2">
									<input
										type="radio"
										name="period"
										aria-label="Morning (AM)"
										checked={halfDayPeriod === "am"}
										onChange={() => setHalfDayPeriod("am")}
									/>
									Morning (AM)
								</label>
								<label className="flex items-center gap-2">
									<input
										type="radio"
										name="period"
										aria-label="Afternoon (PM)"
										checked={halfDayPeriod === "pm"}
										onChange={() => setHalfDayPeriod("pm")}
									/>
									Afternoon (PM)
								</label>
							</div>
						</div>
					</>
				) : (
					<div className="grid grid-cols-2 gap-3">
						<Field label="Start date" required>
							<input
								type="date"
								aria-label="Start date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								required
								className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</Field>
						<Field label="End date" required>
							<input
								type="date"
								aria-label="End date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								required
								className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
							/>
						</Field>
					</div>
				)}

				<Field label="Reason">
					<textarea
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						rows={3}
						className="w-full border border-border-subtle rounded px-3 py-2 bg-canvas text-text-primary placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 focus:outline-none"
					/>
				</Field>

				<p className="text-sm text-text-secondary">
					Total days: <strong>{totalDays}</strong>
				</p>

				{error && (
					<p role="alert" className="text-coral text-sm">
						{error}
					</p>
				)}

				<button
					type="submit"
					disabled={
						submitting || !leaveType || !startDate || !endDate || totalDays <= 0
					}
					className="bg-accent-500 text-white py-2 px-4 rounded disabled:opacity-50 hover:bg-accent-600"
				>
					{submitting ? "Submitting…" : "Apply"}
				</button>
			</form>
		</div>
	);
}

function Field({
	label,
	required,
	children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="block text-sm text-text-secondary mb-1">
				{label} {required && <span className="text-coral">*</span>}
			</span>
			{children}
		</label>
	);
}
