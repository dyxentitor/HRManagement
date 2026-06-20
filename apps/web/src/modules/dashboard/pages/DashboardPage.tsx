import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
	type ActivityFeedData,
	type CardData,
	type CompanyAnnouncementsData,
	type DashboardResponse,
	type EmployeeSnapshotData,
	type HeroSummaryData,
	type PayrollStatusData,
	type PendingTasksData,
	type SmartInsightsData,
	getDashboard,
} from "../api";
import { LeaveBalanceCard } from "../components/cards/LeaveBalanceCard";
import { RecentClaimsCard } from "../components/cards/RecentClaimsCard";
import { CommunityLayer } from "../components/command/CommunityLayer";
import { HeroWorkspace } from "../components/command/HeroWorkspace";
import { OperationalWorkspace } from "../components/command/OperationalWorkspace";
import { SmartInsights } from "../components/command/SmartInsights";
import { TodaysFocus } from "../components/command/TodaysFocus";

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

function heroCta(perms: Set<string>): { to: string; label: string } | undefined {
	if (perms.has("payroll:run:create")) return { to: "/payroll/admin", label: "Run payroll" };
	if (perms.has("employee:create")) return { to: "/employees/new", label: "Add employee" };
	if (perms.has("approvals:inbox:read")) return { to: "/approvals", label: "Review approvals" };
	if (perms.has("leave:request:create:self")) return { to: "/leave/me", label: "Apply for leave" };
	return undefined;
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
				<Skeleton className="h-44 rounded-xl" />
				<div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
					{["a", "b", "c", "d", "e"].map((k) => (
						<Skeleton key={k} className="h-32 rounded-xl" />
					))}
				</div>
				<div className="grid lg:grid-cols-3 gap-4">
					{["a", "b", "c"].map((k) => (
						<Skeleton key={k} className="h-56 rounded-xl" />
					))}
				</div>
			</div>
		);
	}

	if (error) return <p className="text-coral p-4">{error}</p>;
	if (!dashboard) return null;

	const cards = dashboard.cards;
	const data = <T,>(type: string): T | undefined =>
		cards.find((c: CardData) => c.type === type)?.data as T | undefined;

	const hero = data<HeroSummaryData>("hero_summary");
	const tasks = data<PendingTasksData>("pending_tasks")?.tasks ?? [];
	const announcements = data<CompanyAnnouncementsData>("company_announcements");
	const featured = announcements?.items.find((a) => a.featured);
	const holidays =
		(data<{ holidays?: { date: string; name: string; type: string }[] }>(
			"upcoming_holidays",
		)?.holidays) ?? [];
	const birthdays =
		(data<{ birthdays?: { employee_code: string; name: string; day: number }[] }>(
			"birthdays_this_month",
		)?.birthdays) ?? [];
	const leave = cards.find((c) => c.type === "my_leave_balance");
	const claims = cards.find((c) => c.type === "recent_claims_self");
	const insights = data<SmartInsightsData>("smart_insights");

	return (
		<div className="space-y-5">
			<HeroWorkspace
				firstName={getFirstName(user?.email ?? "")}
				hero={hero}
				tasks={tasks}
				featured={featured}
				cta={heroCta(perms)}
			/>

			<TodaysFocus tasks={tasks} />

			{/* Personal cards (employee variant) */}
			{(leave || claims) && (
				<div className="grid md:grid-cols-2 gap-4">
					{leave && <LeaveBalanceCard data={leave.data} />}
					{claims && <RecentClaimsCard data={claims.data} />}
				</div>
			)}

			<OperationalWorkspace
				snapshot={data<EmployeeSnapshotData>("employee_snapshot")}
				payroll={data<PayrollStatusData>("payroll_status")}
				activity={data<ActivityFeedData>("activity_feed")}
				perms={perms}
			/>

			<CommunityLayer
				announcements={announcements}
				featuredId={featured?.id}
				holidays={holidays}
				birthdays={birthdays}
			/>

			{insights && <SmartInsights data={insights} />}
		</div>
	);
}
