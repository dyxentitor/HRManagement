import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";
import { type CardData, type DashboardResponse, getDashboard } from "../api";
import { BirthdaysCard } from "../components/cards/BirthdaysCard";
import { CertsExpiringCard } from "../components/cards/CertsExpiringCard";
import { KpiProgressCard } from "../components/cards/KpiProgressCard";
import { LeaveBalanceCard } from "../components/cards/LeaveBalanceCard";
import { PendingApprovalsCard } from "../components/cards/PendingApprovalsCard";
import { RecentClaimsCard } from "../components/cards/RecentClaimsCard";
import { TodayAttendanceCard } from "../components/cards/TodayAttendanceCard";
import { UpcomingHolidaysCard } from "../components/cards/UpcomingHolidaysCard";

const CARD_COMPONENTS: Record<
	string,
	(props: { data: Record<string, unknown> }) => JSX.Element
> = {
	pending_approvals: PendingApprovalsCard,
	my_leave_balance: LeaveBalanceCard,
	upcoming_holidays: UpcomingHolidaysCard,
	certs_expiring_team: CertsExpiringCard,
	kpi_cycle_progress_team: KpiProgressCard,
	today_attendance_team: TodayAttendanceCard,
	recent_claims_self: RecentClaimsCard,
	birthdays_this_month: BirthdaysCard,
};

function pickVariant(perms: Set<string>): "me" | "team" | "admin" | null {
	if (perms.has("dashboard:read:admin")) return "admin";
	if (perms.has("dashboard:read:team")) return "team";
	if (perms.has("dashboard:read:me")) return "me";
	return null;
}

function DashboardCard({ card }: { card: CardData }) {
	const Component = CARD_COMPONENTS[card.type];
	if (!Component) {
		return (
			<div className="bg-white border rounded p-4">
				<h3 className="font-semibold text-sm text-slate-700">{card.title}</h3>
				<pre className="text-xs text-slate-500 mt-1">
					{JSON.stringify(card.data, null, 2)}
				</pre>
			</div>
		);
	}
	return <Component data={card.data} />;
}

export default function DashboardPage() {
	const { perms } = useAuth();
	const variant = pickVariant(perms);
	const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!variant) {
			setLoading(false);
			return;
		}
		getDashboard(variant)
			.then(setDashboard)
			.catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
			.finally(() => setLoading(false));
	}, [variant]);

	if (!variant) {
		return (
			<div className="p-4">
				<p className="text-slate-500">
					You do not have access to any dashboard.
				</p>
			</div>
		);
	}

	if (loading) return <p>Loading dashboard…</p>;
	if (error) return <p className="text-red-600">{error}</p>;
	if (!dashboard) return null;

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-bold capitalize">{variant} Dashboard</h1>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{dashboard.cards.map((card) => (
					<DashboardCard key={card.type} card={card} />
				))}
			</div>
		</div>
	);
}
