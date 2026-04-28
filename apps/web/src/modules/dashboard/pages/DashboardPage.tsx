import { useEffect, useState } from "react";

import { KpiTile } from "@/components/hrms";
import { PageHeader } from "@/components/shell/PageHeader";
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

// KPI card types rendered in the top 4-up row — excluded from the body grid
const KPI_CARD_TYPES = new Set([
	"my_leave_balance",
	"pending_approvals",
	"today_attendance_team",
	"kpi_cycle_progress_team",
	"certs_expiring_team",
	// headcount / on_leave / pending_payroll / unread_alerts are admin-only and
	// handled inline as KPI tiles below
]);

type Variant = "me" | "team" | "admin";

function pickVariant(perms: Set<string>): Variant | null {
	if (perms.has("dashboard:read:admin")) return "admin";
	if (perms.has("dashboard:read:team")) return "team";
	if (perms.has("dashboard:read:me")) return "me";
	return null;
}

function getFirstName(email: string): string {
	const local = email.split("@")[0] ?? "";
	const part = local.split(".")[0] ?? local;
	return part.charAt(0).toUpperCase() + part.slice(1);
}

function pageTitle(variant: Variant, userEmail: string): string {
	if (variant === "me") return `Good day, ${getFirstName(userEmail)} ☀`;
	if (variant === "team") return "Team Dashboard";
	return "Admin Dashboard";
}

// ---- KPI tile extraction helpers ----

function findCard(
	cards: CardData[],
	type: string,
): Record<string, unknown> | null {
	return cards.find((c) => c.type === type)?.data ?? null;
}

interface KpiSpec {
	label: string;
	value: string;
	delta?: string;
	tone: "peach" | "lavender" | "mint" | "yellow" | "coral" | "sky";
	icon: string;
}

function buildKpiTiles(variant: Variant, cards: CardData[]): KpiSpec[] {
	if (variant === "me") {
		const leave = findCard(cards, "my_leave_balance");
		const approvals = findCard(cards, "pending_approvals");
		const attendance = findCard(cards, "today_attendance_team");
		const kpi = findCard(cards, "kpi_cycle_progress_team");

		const annualDays = (leave?.annual_days as number) ?? 0;
		const carried = (leave?.carried as number) ?? 0;
		const attendancePct =
			(attendance?.team_size as number) > 0
				? Math.round(
						(((attendance?.present as number) ?? 0) /
							(attendance?.team_size as number)) *
							100,
					)
				: 0;
		const kpiTotal = (kpi?.total as number) ?? 0;
		const kpiCompleted = (kpi?.completed as number) ?? 0;
		const openKpis = Math.max(0, kpiTotal - kpiCompleted);

		return [
			{
				label: "Annual leave",
				value: `${annualDays} d`,
				delta: carried ? `+${carried} carried` : undefined,
				tone: "peach",
				icon: "AL",
			},
			{
				label: "Pending requests",
				value: String((approvals?.count as number) ?? "—"),
				tone: "lavender",
				icon: "PR",
			},
			{
				label: "Attendance %",
				value: `${attendancePct}%`,
				tone: "mint",
				icon: "AT",
			},
			{
				label: "Open KPIs",
				value: String(openKpis || "—"),
				tone: "yellow",
				icon: "KP",
			},
		];
	}

	if (variant === "team") {
		const approvals = findCard(cards, "pending_approvals");
		const attendance = findCard(cards, "today_attendance_team");
		const certs = findCard(cards, "certs_expiring_team");
		const kpi = findCard(cards, "kpi_cycle_progress_team");

		const attendancePct =
			(attendance?.team_size as number) > 0
				? Math.round(
						(((attendance?.present as number) ?? 0) /
							(attendance?.team_size as number)) *
							100,
					)
				: 0;
		const kpiTotal = (kpi?.total as number) ?? 0;
		const kpiCompleted = (kpi?.completed as number) ?? 0;
		const kpiPct =
			kpiTotal > 0 ? Math.round((kpiCompleted / kpiTotal) * 100) : 0;

		return [
			{
				label: "Pending approvals",
				value: String((approvals?.count as number) ?? "—"),
				tone: "peach",
				icon: "PA",
			},
			{
				label: "Team attendance today",
				value: `${attendancePct}%`,
				tone: "mint",
				icon: "AT",
			},
			{
				label: "Certs expiring",
				value: String(((certs?.certs as unknown[]) ?? []).length || "—"),
				tone: "yellow",
				icon: "CE",
			},
			{
				label: "KPI cycle progress",
				value: `${kpiPct}%`,
				tone: "lavender",
				icon: "KP",
			},
		];
	}

	// admin
	const headcount = findCard(cards, "headcount");
	const onLeave = findCard(cards, "on_leave_today");
	const payroll = findCard(cards, "pending_payroll");
	const alerts = findCard(cards, "unread_alerts");

	return [
		{
			label: "Headcount",
			value: String((headcount?.count as number) ?? "—"),
			tone: "lavender",
			icon: "HC",
		},
		{
			label: "On leave today",
			value: String((onLeave?.count as number) ?? "—"),
			tone: "peach",
			icon: "OL",
		},
		{
			label: "Pending payroll",
			value: String((payroll?.count as number) ?? "—"),
			tone: "yellow",
			icon: "PP",
		},
		{
			label: "Unread alerts",
			value: String((alerts?.count as number) ?? "—"),
			tone: "coral",
			icon: "UA",
		},
	];
}

function DashboardCard({ card }: { card: CardData }) {
	const Component = CARD_COMPONENTS[card.type];
	if (!Component) {
		return (
			<div className="bg-surface-hover border border-border-subtle rounded-lg p-4">
				<h3 className="text-label font-semibold text-text-secondary">
					{card.title}
				</h3>
				<pre className="text-small text-text-tertiary mt-2 overflow-auto">
					{JSON.stringify(card.data, null, 2)}
				</pre>
			</div>
		);
	}
	return <Component data={card.data} />;
}

export default function DashboardPage() {
	const { user, perms } = useAuth();
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
				<p className="text-text-tertiary">
					You do not have access to any dashboard.
				</p>
			</div>
		);
	}

	if (loading) {
		return <p className="text-text-tertiary p-4">Loading dashboard…</p>;
	}

	if (error) {
		return <p className="text-coral p-4">{error}</p>;
	}

	if (!dashboard) return null;

	const kpiTiles = buildKpiTiles(variant, dashboard.cards);

	// Body cards: exclude cards already surfaced in the KPI row
	const bodyCards = dashboard.cards.filter((c) => !KPI_CARD_TYPES.has(c.type));

	const email = user?.email ?? "";

	return (
		<div className="space-y-6">
			<PageHeader
				breadcrumb={`Dashboard / ${variant}`}
				title={pageTitle(variant, email)}
			/>

			{/* 4-up KPI tiles */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
				{kpiTiles.map((tile) => (
					<KpiTile
						key={tile.label}
						tone={tile.tone}
						icon={tile.icon}
						label={tile.label}
						value={tile.value}
						delta={tile.delta}
					/>
				))}
			</div>

			{/* Body cards grid — cards not surfaced in the KPI tile row */}
			{bodyCards.length > 0 && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					{bodyCards.map((card) => (
						<DashboardCard key={card.type} card={card} />
					))}
				</div>
			)}
		</div>
	);
}
