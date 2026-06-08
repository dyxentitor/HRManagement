import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
	type Column,
	DataTable,
	DetailPanel,
	KpiTile,
	StatusPill,
} from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";

import { type LeaveBalance, type LeaveRequest, leaveApi } from "../api";
import { EntitlementCard } from "../components/EntitlementCard";

const TYPE_TONE: Record<
	string,
	"lavender" | "coral" | "peach" | "sky" | "mint" | "yellow"
> = {
	ANNUAL: "lavender",
	SICK: "coral",
	REPLACEMENT: "peach",
	COMPASSIONATE: "sky",
	MATERNITY: "mint",
	PATERNITY: "mint",
	UNPAID: "yellow",
};

const STATUS_TONE: Record<
	LeaveRequest["status"],
	"mint" | "yellow" | "coral" | "sky"
> = {
	approved: "mint",
	submitted: "yellow",
	rejected: "coral",
	cancelled: "sky",
	withdrawn: "sky",
	draft: "sky",
};

function halfDayLabel(r: LeaveRequest): string | null {
	if (!r.is_half_day) return null;
	return r.half_day_period === "pm" ? "½ PM" : "½ AM";
}

export default function MyLeavePage() {
	const [balances, setBalances] = useState<LeaveBalance[]>([]);
	const [requests, setRequests] = useState<LeaveRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<LeaveRequest | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [b, r] = await Promise.all([
				leaveApi.myBalances(),
				leaveApi.listMyRequests(),
			]);
			setBalances(b);
			setRequests(r);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const summary = useMemo(() => {
		const total = requests.length;
		const approved = requests.filter((r) => r.status === "approved").length;
		const rejected = requests.filter((r) => r.status === "rejected").length;
		const pending = requests.filter((r) => r.status === "submitted").length;
		return { total, approved, rejected, pending };
	}, [requests]);

	const columns: Column<LeaveRequest>[] = [
		{
			key: "type",
			header: "Type",
			render: (r) => (
				<StatusPill
					tone={TYPE_TONE[r.leave_type_code] ?? "lavender"}
					label={r.leave_type_code}
				/>
			),
		},
		{ key: "from", header: "From", render: (r) => r.start_date },
		{ key: "to", header: "To", render: (r) => r.end_date },
		{
			key: "days",
			header: "Days",
			render: (r) => {
				const half = halfDayLabel(r);
				return (
					<span className="inline-flex items-center justify-end gap-1.5">
						{`${r.total_days}d`}
						{half && (
							<span className="text-label uppercase text-accent-200">
								{half}
							</span>
						)}
					</span>
				);
			},
			align: "right",
		},
		{
			key: "status",
			header: "Status",
			render: (r) => (
				<StatusPill tone={STATUS_TONE[r.status]} label={r.status} />
			),
		},
	];

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
		selected &&
		(selected.status === "draft" || selected.status === "submitted");

	return (
		<div className="space-y-6">
			<PageHeader
				title="Leave"
				actions={
					<Button
						asChild
						className="bg-accent-500 hover:bg-accent-600 text-white"
					>
						<Link to="/leave/apply">
							<Plus className="size-4 mr-1" /> Apply for leave
						</Link>
					</Button>
				}
			/>

			{error && (
				<p className="text-coral text-small" role="alert">
					{error}
				</p>
			)}

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<KpiTile
					tone="sky"
					icon={String(summary.total)}
					label="Total leave"
					value={String(summary.total)}
				/>
				<KpiTile
					tone="lavender"
					icon={String(summary.approved)}
					label="Approved"
					value={String(summary.approved)}
				/>
				<KpiTile
					tone="coral"
					icon={String(summary.rejected)}
					label="Rejected"
					value={String(summary.rejected)}
				/>
				<KpiTile
					tone="yellow"
					icon={String(summary.pending)}
					label="Pending"
					value={String(summary.pending)}
				/>
			</div>

			<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				{loading ? (
					<p className="text-text-tertiary text-body">Loading…</p>
				) : (
					<DataTable<LeaveRequest>
						rows={requests}
						columns={columns}
						rowKey={(r) => r.id}
						onRowClick={(r) => setSelected(r)}
					/>
				)}
			</div>

			{balances.length > 0 ? (
				<div className="space-y-3">
					<h2 className="text-h3 text-text-primary">Balances</h2>
					<div className="flex flex-wrap gap-2">
						{balances.map((b) => (
							<StatusPill
								key={b.id}
								tone={TYPE_TONE[b.leave_type_code] ?? "lavender"}
								label={`${b.leave_type_code}: ${b.available}/${b.entitled} d`}
							/>
						))}
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{balances.map((b) => (
							<EntitlementCard key={`card-${b.id}`} balance={b} />
						))}
					</div>
				</div>
			) : null}

			<DetailPanel
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected ? `Leave · ${selected.id}` : "Leave"}
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
						<dt className="text-label uppercase text-text-tertiary self-center">
							Type
						</dt>
						<dd>
							<StatusPill
								tone={TYPE_TONE[selected.leave_type_code] ?? "lavender"}
								label={selected.leave_type_code}
							/>
						</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">
							Range
						</dt>
						<dd>
							{selected.start_date} → {selected.end_date}
						</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">
							Days
						</dt>
						<dd>
							{selected.total_days}
							{halfDayLabel(selected) ? ` · ${halfDayLabel(selected)}` : ""}
						</dd>
						<dt className="text-label uppercase text-text-tertiary self-center">
							Status
						</dt>
						<dd>
							<StatusPill
								tone={STATUS_TONE[selected.status]}
								label={selected.status}
							/>
						</dd>
						{selected.reason && (
							<>
								<dt className="text-label uppercase text-text-tertiary self-start">
									Reason
								</dt>
								<dd>{selected.reason}</dd>
							</>
						)}
					</dl>
				)}
			</DetailPanel>
		</div>
	);
}
