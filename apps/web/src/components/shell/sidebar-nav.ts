import {
	BarChart3,
	Briefcase,
	Calendar,
	ClipboardCheck,
	ClipboardList,
	Coins,
	FileSpreadsheet,
	GraduationCap,
	Inbox,
	LayoutDashboard,
	ListChecks,
	Receipt,
	Settings,
	Target,
	UserCircle,
	Users,
	Wallet,
} from "lucide-react";

import type { ComponentType } from "react";

export interface NavItem {
	label: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
	/** permission code that gates visibility; "" means always visible */
	perm: string;
	/** if set, item is visible when ANY of these perms is granted (OR); overrides `perm` */
	anyPerm?: string[];
	/** module key — if set, item is hidden when the feature flag is off */
	module?: string;
	/** key used by useNotifBadge to read unread counts */
	badge?: "approvals" | "notifications";
}

export interface NavGroup {
	id: "personal" | "team" | "admin";
	label: string;
	items: NavItem[];
}

export const NAV: NavGroup[] = [
	{
		id: "personal",
		label: "Personal",
		items: [
			{ label: "Dashboard", to: "/", icon: LayoutDashboard, perm: "" },
			{ label: "Action Center", to: "/action-center", icon: ListChecks, perm: "" },
			{
				label: "My Mandays",
				to: "/incentive",
				icon: Coins,
				perm: "incentive:claim",
				module: "incentive",
			},
			{ label: "My Profile", to: "/me/profile", icon: UserCircle, perm: "" },
			{
				label: "Leave",
				to: "/leave/me",
				icon: Calendar,
				perm: "leave:request:create:self",
				module: "leave",
			},
			{
				label: "Schedule",
				to: "/schedule/me",
				icon: Briefcase,
				perm: "attendance:clock:self",
				module: "schedule",
			},
			{
				label: "Claims",
				to: "/claims/me",
				icon: Receipt,
				perm: "claim:create:self",
				module: "claims",
			},
			{
				label: "Payslips",
				to: "/payslips/me",
				icon: Wallet,
				perm: "payslip:read:self",
				module: "payslip",
			},
			{
				label: "KPI",
				to: "/kpi/me",
				icon: Target,
				perm: "kpi:assignment:read:self",
				module: "kpi",
			},
			{
				label: "Growth",
				to: "/growth",
				icon: GraduationCap,
				perm: "cert:read:self",
				module: "certification",
			},
		],
	},
	{
		id: "team",
		label: "Team",
		items: [
			{
				label: "Approvals",
				to: "/approvals",
				icon: Inbox,
				perm: "approvals:inbox:read",
				badge: "approvals",
				module: "approvals",
			},
			{
				label: "Roster",
				to: "/schedule/roster",
				icon: ClipboardCheck,
				perm: "schedule:assignment:write:team",
				module: "schedule",
			},
		],
	},
	{
		id: "admin",
		label: "Admin",
		items: [
			{
				label: "Assignments",
				to: "/admin/assignments",
				icon: ClipboardList,
				perm: "assignment:read:org",
				// HR/admin (read:org) OR managers/team-leads (create:team) — one entry, no duplicate.
				anyPerm: ["assignment:read:org", "assignment:create:team"],
			},
			{
				label: "Incentive",
				to: "/admin/incentive",
				icon: Briefcase,
				perm: "incentive:project:write",
				// admin (full) OR managers/team-leads (open projects + review claims).
				anyPerm: ["incentive:admin", "incentive:project:write"],
				module: "incentive",
			},
			{
				label: "People",
				to: "/admin/people",
				icon: Users,
				perm: "employee:read:org",
			},
			{
				label: "Payroll",
				to: "/payroll/admin",
				icon: Wallet,
				perm: "payroll:run:create",
				// Backend uses @requires_feature("payslip") for PayrollPeriodViewSet
				// and PayrollRunViewSet. Module key must match the registry key —
				// "payroll" was a typo that fell into useFeature's unknown-key=enabled
				// branch, so disabled-payslip orgs still saw the Payroll sidebar link.
				module: "payslip",
			},
			{
				label: "Reports",
				to: "/reports",
				icon: FileSpreadsheet,
				perm: "report:list",
				module: "reports",
			},
			{
				label: "KPI Admin",
				to: "/kpi/admin",
				icon: BarChart3,
				perm: "kpi:cycle:write",
				module: "kpi",
			},
			// v1.9.0: Roles / Teams / Modules / Leave Types collapsed into a
			// single Settings entry that opens the new /admin/settings shell.
			{
				label: "Settings",
				to: "/admin/settings",
				icon: Settings,
				perm: "role:read",
			},
		],
	},
];
