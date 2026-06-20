import { useCallback, useEffect, useMemo, useState } from "react";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
	type Holiday,
	type LeaveBalance,
	type LeaveRequest,
	type LeaveType,
	leaveApi,
} from "../api";
import { EntitlementCard } from "../components/EntitlementCard";
import { InProgressLeave } from "../components/InProgressLeave";
import { LeaveActivityTimeline } from "../components/LeaveActivityTimeline";
import { LeaveBalanceHero } from "../components/LeaveBalanceHero";
import { LeaveBalanceTiles } from "../components/LeaveBalanceTiles";
import { LeaveCalendar } from "../components/LeaveCalendar";
import { LeaveTypeCards } from "../components/LeaveTypeCards";
import { formatRange } from "../lib/leave-dates";
import { STATUS_TONE, typeTone } from "../lib/leave-ui";

function halfDayLabel(r: LeaveRequest): string | null {
	if (!r.is_half_day) return null;
	return r.half_day_period === "pm" ? "½ PM" : "½ AM";
}

function currentMonthUtc(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export default function MyLeavePage() {
	const [balances, setBalances] = useState<LeaveBalance[]>([]);
	const [requests, setRequests] = useState<LeaveRequest[]>([]);
	const [types, setTypes] = useState<LeaveType[]>([]);
	const [holidays, setHolidays] = useState<Holiday[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<LeaveRequest | null>(null);
	const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			// Required vs optional: holidays/types failures must not blank the page (§3.7).
			const [b, r] = await Promise.all([leaveApi.myBalances(), leaveApi.listMyRequests()]);
			setBalances(b);
			setRequests(r);
			try {
				setHolidays(await leaveApi.holidays(new Date().getFullYear()));
			} catch {
				setHolidays([]);
			}
			try {
				setTypes(await leaveApi.listTypes());
			} catch {
				setTypes([]);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const primaryCode = useMemo(() => {
		if (balances.length === 0) return "ANNUAL";
		return [...balances].sort((a, b) => Number(b.entitled) - Number(a.entitled))[0].leave_type_code;
	}, [balances]);

	async function onCancel() {
		if (!selected) return;
		try {
			await leaveApi.cancel(selected.id);
			setSelected(null);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Cancel failed");
		}
	}

	const canCancelSelected =
		selected && (selected.status === "draft" || selected.status === "submitted");

	if (loading) {
		return (
			<div className="space-y-6">
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
			<LeaveBalanceHero balances={balances} primaryCode={primaryCode} />

			{error && (
				<p className="text-coral text-small" role="alert">
					{error}
				</p>
			)}

			<LeaveBalanceTiles balances={balances} onSelect={setSelectedBalance} />

			<div className="grid lg:grid-cols-[1.55fr_1fr] gap-6 items-start">
				<InProgressLeave requests={requests} onSelect={setSelected} />
				<div className="space-y-5">
					<section>
						<p className="layer-eyebrow mb-3">This month</p>
						<div className="glass-surface rounded-2xl p-4">
							<LeaveCalendar month={currentMonthUtc()} requests={requests} holidays={holidays} />
						</div>
					</section>
					<LeaveActivityTimeline requests={requests} />
				</div>
			</div>

			<LeaveTypeCards types={types} balances={balances} />

			{/* Request detail drawer */}
			<DetailPanel
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? `Leave · ${selected.leave_type_code}` : "Leave"}
				footer={
					canCancelSelected ? (
						<Button
							type="button"
							variant="outline"
							className="w-full border-coral/30 text-coral hover:bg-coral/10"
							onClick={onCancel}
						>
							Cancel request
						</Button>
					) : null
				}
			>
				{selected && (
					<dl className="grid grid-cols-[110px_1fr] gap-y-2 text-body">
						<dt className="text-label uppercase text-text-tertiary self-center">Type</dt>
						<dd>
							<StatusPill
								tone={typeTone(selected.leave_type_code)}
								label={selected.leave_type_code}
							/>
						</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">Dates</dt>
						<dd>
							{formatRange(selected.start_date, selected.end_date)}
							{halfDayLabel(selected) ? ` · ${halfDayLabel(selected)}` : ""}
						</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">Days</dt>
						<dd>{selected.total_days}</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">Status</dt>
						<dd>
							<StatusPill tone={STATUS_TONE[selected.status]} label={selected.status} />
						</dd>
						{selected.reason && (
							<>
								<dt className="text-label uppercase text-text-tertiary self-start">Reason</dt>
								<dd>{selected.reason}</dd>
							</>
						)}
					</dl>
				)}
			</DetailPanel>

			{/* Balance detail drawer */}
			<DetailPanel
				open={selectedBalance !== null}
				onClose={() => setSelectedBalance(null)}
				title={
					selectedBalance
						? `${selectedBalance.leave_type_name ?? selectedBalance.leave_type_code} balance`
						: "Balance"
				}
			>
				{selectedBalance && <EntitlementCard balance={selectedBalance} />}
			</DetailPanel>
		</div>
	);
}
