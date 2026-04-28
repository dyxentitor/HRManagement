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
			},
			{
				label: "Schedule",
				to: "/schedule/me",
				icon: Briefcase,
				perm: "attendance:clock:self",
			},
			{
				label: "Claims",
				to: "/claims/me",
				icon: Receipt,
				perm: "claim:create:self",
			},
			{
				label: "Payslips",
				to: "/payslips/me",
				icon: Wallet,
				perm: "payslip:read:self",
			},
			{
				label: "KPI",
				to: "/kpi/me",
				icon: Target,
				perm: "kpi:assignment:read:self",
			},
			{
				label: "Certifications",
				to: "/certifications/me",
				icon: GraduationCap,
				perm: "cert:read:self",
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
			},
			{
				label: "Roster",
				to: "/schedule/roster",
				icon: ClipboardCheck,
				perm: "schedule:assignment:write:team",
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
				label: "Payroll",
				to: "/payroll/admin",
				icon: Wallet,
				perm: "payroll:run:create",
			},
			{
				label: "Reports",
				to: "/reports",
				icon: FileSpreadsheet,
				perm: "report:list",
			},
			{
				label: "KPI Admin",
				to: "/kpi/admin",
				icon: BarChart3,
				perm: "kpi:cycle:write",
			},
		],
	},
];
