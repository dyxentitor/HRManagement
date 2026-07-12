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
	Megaphone,
	MessageSquare,
	MessagesSquare,
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
	/** key used by useNavBadges to render a live count pill */
	badge?: "approvals" | "actionCenter" | "announcements";
}

export interface NavGroup {
	/** stable id; "inbox" is the header-less zone at the top */
	id: string;
	/** section header; "" renders no header (used by the inbox zone) */
	label: string;
	items: NavItem[];
}

// Domain-grouped IA (v1.x sidebar redesign). Self- and admin-views of a domain are
// co-located as distinct items; gating (perm / anyPerm / module) is unchanged from the
// previous nav so RBAC + feature-flag behaviour is identical.
export const NAV: NavGroup[] = [
	{
		id: "inbox",
		label: "",
		items: [
			{ label: "Dashboard", to: "/", icon: LayoutDashboard, perm: "" },
			{
				label: "Action Center",
				to: "/action-center",
				icon: ListChecks,
				perm: "",
				badge: "actionCenter",
			},
			{
				label: "Announcements",
				to: "/announcements",
				icon: Megaphone,
				perm: "announcement:read",
				module: "announcements",
				badge: "announcements",
			},
			{
				label: "Approvals",
				to: "/approvals",
				icon: Inbox,
				perm: "approvals:inbox:read",
				badge: "approvals",
				module: "approvals",
			},
		],
	},
	{
		id: "people",
		label: "People",
		items: [
			{ label: "My Profile", to: "/me/profile", icon: UserCircle, perm: "" },
			{ label: "Directory", to: "/admin/people", icon: Users, perm: "employee:read:org" },
			{
				label: "Assignments",
				to: "/admin/assignments",
				icon: ClipboardList,
				perm: "assignment:read:org",
				anyPerm: ["assignment:read:org", "assignment:create:team"],
			},
		],
	},
	{
		id: "time",
		label: "Time",
		items: [
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
				// View gate, not clock gate — disabling attendance:clock:self must not hide the page.
				perm: "attendance:read:self",
				module: "schedule",
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
		id: "money",
		label: "Money",
		items: [
			{
				label: "Payslips",
				to: "/payslips/me",
				icon: Wallet,
				perm: "payslip:read:self",
				module: "payslip",
			},
			{
				label: "Claims",
				to: "/claims/me",
				icon: Receipt,
				perm: "claim:create:self",
				module: "claims",
			},
			{
				label: "My Mandays",
				to: "/incentive",
				icon: Coins,
				perm: "incentive:claim",
				module: "incentive",
			},
			{
				label: "Incentive",
				to: "/admin/incentive",
				icon: Coins,
				perm: "incentive:project:write",
				anyPerm: ["incentive:admin", "incentive:project:write"],
				module: "incentive",
			},
			{
				label: "Payroll",
				to: "/payroll/admin",
				icon: Wallet,
				perm: "payroll:run:create",
				// Backend gates PayrollPeriodViewSet / PayrollRunViewSet with
				// @requires_feature("payslip"); the module key must match.
				module: "payslip",
			},
		],
	},
	{
		id: "growth",
		label: "Growth",
		items: [
			{
				label: "My KPI",
				to: "/kpi/me",
				icon: Target,
				perm: "kpi:assignment:read:self",
				module: "kpi",
			},
			{
				label: "KPI Admin",
				to: "/kpi/admin",
				icon: BarChart3,
				perm: "kpi:cycle:write",
				module: "kpi",
			},
			{
				label: "Learning",
				to: "/growth",
				icon: GraduationCap,
				perm: "cert:read:self",
				module: "certification",
			},
		],
	},
	{
		id: "insights",
		label: "Insights",
		items: [
			{
				label: "Reports",
				to: "/reports",
				icon: FileSpreadsheet,
				perm: "report:list",
				module: "reports",
			},
		],
	},
	{
		// Support = the "talk to us / manage what users tell us" domain. Feedback
		// (self-submit) and Feedback Management (admin) are co-located here per the
		// domain-co-location IA convention above — feedback is communication/support,
		// not analytics (Insights) or system config (Admin).
		id: "support",
		label: "Support",
		items: [
			{
				label: "Feedback",
				to: "/feedback",
				icon: MessageSquare,
				perm: "feedback:submit:self",
				module: "feedback",
			},
			{
				label: "Feedback Management",
				to: "/feedback/manage",
				icon: MessagesSquare,
				perm: "feedback:manage:org",
				module: "feedback",
			},
		],
	},
	{
		id: "admin",
		label: "Admin",
		items: [{ label: "Settings", to: "/admin/settings", icon: Settings, perm: "role:read" }],
	},
];
