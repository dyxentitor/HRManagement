import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
	type CardData,
	type DashboardResponse,
	type HeroSummaryData,
	type PendingTasksData,
	getDashboard,
} from "../api";
import { CertsExpiringCard } from "../components/cards/CertsExpiringCard";
import { KpiProgressCard } from "../components/cards/KpiProgressCard";
import { LeaveBalanceCard } from "../components/cards/LeaveBalanceCard";
import { RecentClaimsCard } from "../components/cards/RecentClaimsCard";
import { TodayAttendanceCard } from "../components/cards/TodayAttendanceCard";
import { ActivityFeed } from "../components/widgets/ActivityFeed";
import { AnnouncementsWidget } from "../components/widgets/AnnouncementsWidget";
import { AttendanceSummaryWidget } from "../components/widgets/AttendanceSummaryWidget";
import { BirthdaysWidget } from "../components/widgets/BirthdaysWidget";
import { DepartmentOverview } from "../components/widgets/DepartmentOverview";
import { EmployeeSnapshotWidget } from "../components/widgets/EmployeeSnapshotWidget";
import { HeroHeader } from "../components/widgets/HeroHeader";
import { HolidaysTimeline } from "../components/widgets/HolidaysTimeline";
import { PayrollStatusStepper } from "../components/widgets/PayrollStatusStepper";
import { QuickActionsPanel } from "../components/widgets/QuickActionsPanel";
import { TaskCardRow } from "../components/widgets/TaskCardRow";

type Variant = "me" | "team" | "admin";

// biome-ignore lint/suspicious/noExplicitAny: card data is an untyped JSON bag; each widget narrows it.
type AnyData = any;

// Body-grid widgets keyed by card type. hero_summary + pending_tasks are pulled
// out and rendered in dedicated slots, so they are absent here.
const BODY_WIDGETS: Record<string, (d: AnyData) => JSX.Element> = {
	employee_snapshot: (d) => <EmployeeSnapshotWidget data={d} />,
	attendance_summary: (d) => <AttendanceSummaryWidget data={d} />,
	payroll_status: (d) => <PayrollStatusStepper data={d} />,
	department_overview: (d) => <DepartmentOverview data={d} />,
	company_announcements: (d) => <AnnouncementsWidget data={d} />,
	activity_feed: (d) => <ActivityFeed data={d} />,
	upcoming_holidays: (d) => <HolidaysTimeline data={d} />,
	birthdays_this_month: (d) => <BirthdaysWidget data={d} />,
	my_leave_balance: (d) => <LeaveBalanceCard data={d} />,
	recent_claims_self: (d) => <RecentClaimsCard data={d} />,
	today_attendance_team: (d) => <TodayAttendanceCard data={d} />,
	certs_expiring_team: (d) => <CertsExpiringCard data={d} />,
	kpi_cycle_progress_team: (d) => <KpiProgressCard data={d} />,
};

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

function heroCta(perms: Set<string>): { to: string; label: string } | undefined {
	if (perms.has("payroll:run:create")) return { to: "/payroll/admin", label: "Run payroll" };
	if (perms.has("employee:create")) return { to: "/employees/new", label: "Add employee" };
	if (perms.has("approvals:inbox:read")) return { to: "/approvals", label: "Review approvals" };
	if (perms.has("leave:request:create:self")) return { to: "/leave/me", label: "Apply for leave" };
	return undefined;
}

function findCard(cards: CardData[], type: string): CardData | undefined {
	return cards.find((c) => c.type === type);
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
			<p className="text-text-tertiary p-4">
				You do not have access to any dashboard.
			</p>
		);
	}

	if (loading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-24 rounded-lg" />
				<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
					{["a", "b", "c", "d", "e"].map((k) => (
						<Skeleton key={k} className="h-24 rounded-lg" />
					))}
				</div>
				<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
					{["a", "b", "c", "d", "e", "f"].map((k) => (
						<Skeleton key={k} className="h-40 rounded-lg" />
					))}
				</div>
			</div>
		);
	}

	if (error) return <p className="text-coral p-4">{error}</p>;
	if (!dashboard) return null;

	const hero = findCard(dashboard.cards, "hero_summary")?.data as
		| HeroSummaryData
		| undefined;
	const tasks = (findCard(dashboard.cards, "pending_tasks")?.data as
		| PendingTasksData
		| undefined)?.tasks;

	const bodyCards = dashboard.cards.filter(
		(c) => c.type !== "hero_summary" && c.type !== "pending_tasks",
	);

	return (
		<div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
			<div className="space-y-4 min-w-0">
				<HeroHeader
					firstName={getFirstName(user?.email ?? "")}
					data={hero}
					cta={heroCta(perms)}
				/>

				{tasks && <TaskCardRow tasks={tasks} />}

				<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
					{bodyCards.map((card) => {
						const render = BODY_WIDGETS[card.type];
						if (!render) return null;
						return <div key={card.type}>{render(card.data as AnyData)}</div>;
					})}
				</div>
			</div>

			<QuickActionsPanel perms={perms} />
		</div>
	);
}
