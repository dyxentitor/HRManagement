import {
	BarChart3,
	Briefcase,
	Calendar,
	ClipboardCheck,
	FileSpreadsheet,
	GraduationCap,
	Inbox,
	LayoutDashboard,
	Receipt,
	Settings,
	Shield,
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
				label: "Certifications",
				to: "/certifications/me",
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
				label: "Employees",
				to: "/employees",
				icon: Users,
				perm: "employee:read:org",
			},
			{
				label: "Roles",
				to: "/admin/roles",
				icon: Shield,
				perm: "role:read",
			},
			{
				label: "Teams",
				to: "/admin/teams",
				icon: Users,
				perm: "team:write",
			},
			{
				label: "Modules",
				to: "/admin/modules",
				icon: Settings,
				perm: "org:feature_flag:read",
			},
			{
				label: "Leave types",
				to: "/admin/leave-types",
				icon: Calendar,
				perm: "leave:type:write",
				module: "leave",
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
		],
	},
];
