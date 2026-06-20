import { useCallback, useEffect, useMemo, useState } from "react";

import { DetailPanel, StatusPill } from "@/components/hrms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { type Holiday, type LeaveBalance, type LeaveRequest, leaveApi } from "../api";
import { EntitlementCard } from "../components/EntitlementCard";
import { LeaveCalendar } from "../components/LeaveCalendar";
import { LeaveHero } from "../components/LeaveHero";
import { LeaveHistory } from "../components/LeaveHistory";
import { UpcomingTimeline } from "../components/UpcomingTimeline";
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
	const [holidays, setHolidays] = useState<Holiday[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<LeaveRequest | null>(null);
	const [tab, setTab] = useState("calendar");

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			// Required vs optional: a holidays failure must not blank the page (§3.7).
			const [b, r] = await Promise.all([leaveApi.myBalances(), leaveApi.listMyRequests()]);
			setBalances(b);
			setRequests(r);
			try {
				setHolidays(await leaveApi.holidays(new Date().getFullYear()));
			} catch {
				setHolidays([]);
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
		return [...balances].sort((a, b) => Number(b.entitled) - Number(a.entitled))[0]
			.leave_type_code;
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
			<div className="space-y-5">
				<Skeleton className="h-32 rounded-xl" />
				<Skeleton className="h-9 w-72 rounded-lg" />
				<Skeleton className="h-72 rounded-xl" />
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{error && (
				<p className="text-coral text-small" role="alert">
					{error}
				</p>
			)}

			<LeaveHero
				balances={balances}
				primaryCode={primaryCode}
				onSelectType={() => setTab("balances")}
			/>

			<Tabs value={tab} onValueChange={setTab}>
				<TabsList>
					<TabsTrigger value="calendar">Calendar</TabsTrigger>
					<TabsTrigger value="history">History</TabsTrigger>
					<TabsTrigger value="balances">Balances</TabsTrigger>
				</TabsList>

				<TabsContent value="calendar">
					<div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
						<div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
							<LeaveCalendar month={currentMonthUtc()} requests={requests} holidays={holidays} />
						</div>
						<div className="bg-surface-hover border border-border-subtle rounded-xl p-4">
							<h3 className="text-label font-semibold text-text-secondary mb-3">
								Upcoming
							</h3>
							<UpcomingTimeline requests={requests} holidays={holidays} />
						</div>
					</div>
				</TabsContent>

				<TabsContent value="history">
					<LeaveHistory requests={requests} onSelect={setSelected} />
				</TabsContent>

				<TabsContent value="balances">
					{balances.length === 0 ? (
						<p className="text-text-tertiary text-small">No balances yet.</p>
					) : (
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							{balances.map((b) => (
								<EntitlementCard key={b.id} balance={b} />
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>

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
							<StatusPill tone={typeTone(selected.leave_type_code)} label={selected.leave_type_code} />
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
		</div>
	);
}
