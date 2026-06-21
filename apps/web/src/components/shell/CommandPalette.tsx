import {
	BarChart3,
	Calendar,
	Clock,
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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { useCommandPalette } from "@/lib/cmdk";
import { useFeature } from "@/lib/feature-flags";
import { useCan } from "@/lib/perm";

import { type Employee, employeeApi } from "@/modules/employee/api";

const PAGES = [
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
		icon: Clock,
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
	{
		label: "Approvals",
		to: "/approvals",
		icon: Inbox,
		perm: "approvals:inbox:read",
		module: "approvals",
	},
	{
		label: "People · Directory",
		to: "/admin/people",
		icon: Users,
		perm: "employee:read:org",
	},
	{
		label: "People · Invitations",
		to: "/admin/people/invitations",
		icon: Users,
		perm: "user:create",
	},
	{
		label: "People · Accounts",
		to: "/admin/people/accounts",
		icon: Users,
		perm: "employee:write:org",
	},
	// v1.9.0 — admin pages now live under /admin/settings/* shell.
	{
		label: "Settings · Overview",
		to: "/admin/settings",
		icon: Settings,
		perm: "role:read",
	},
	{
		label: "Settings · Organization",
		to: "/admin/settings/organization",
		icon: Settings,
		perm: "org:settings:write",
	},
	{
		label: "Settings · Departments",
		to: "/admin/settings/departments",
		icon: Settings,
		perm: "department:read",
	},
	{
		label: "Settings · Archived Employees",
		to: "/admin/settings/archived",
		icon: Users,
		perm: "employee:archive",
	},
	{
		label: "Settings · Roles",
		to: "/admin/settings/roles",
		icon: Shield,
		perm: "role:read",
	},
	{
		label: "Settings · Teams",
		to: "/admin/settings/teams",
		icon: Users,
		perm: "team:write",
	},
	{
		label: "Settings · Modules",
		to: "/admin/settings/modules",
		icon: Settings,
		perm: "org:feature_flag:read",
	},
	{
		label: "Settings · Leave types",
		to: "/admin/settings/leave-types",
		icon: Calendar,
		perm: "leave:type:write",
		module: "leave",
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
];

export function CommandPalette() {
	const { open, setOpen } = useCommandPalette();
	const nav = useNavigate();
	const canViewEmployees = useCan("employee:read:org");
	const [employees, setEmployees] = useState<Employee[]>([]);

	// Pre-cache page perm checks at top level so the rules-of-hooks count is fixed.
	// biome-ignore lint/correctness/useHookAtTopLevel: PAGES is module-constant; hook count is fixed.
	const pagePerms = PAGES.map((p) => (p.perm === "" ? true : useCan(p.perm)));
	// biome-ignore lint/correctness/useHookAtTopLevel: PAGES is module-constant; hook count is fixed.
	const pageFeatures = PAGES.map((p) => (p.module ? useFeature(p.module) : true));

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen(!open);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, setOpen]);

	useEffect(() => {
		if (!open || !canViewEmployees) return;
		if (employees.length > 0) return;
		employeeApi
			.list()
			.then(setEmployees)
			.catch(() => {
				// silent — palette stays usable for pages
			});
	}, [open, canViewEmployees, employees.length]);

	const go = (to: string) => {
		setOpen(false);
		nav(to);
	};

	const visiblePages = PAGES.filter((_, i) => pagePerms[i] && pageFeatures[i]);

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<CommandInput placeholder="Search pages, employees, actions…" />
			<CommandList>
				<CommandEmpty>No results.</CommandEmpty>

				<CommandGroup heading="Pages">
					{visiblePages.map((p) => {
						const Icon = p.icon;
						return (
							<CommandItem key={p.to} onSelect={() => go(p.to)} value={p.label}>
								<Icon className="size-4 mr-2" aria-hidden /> {p.label}
							</CommandItem>
						);
					})}
				</CommandGroup>

				{canViewEmployees && employees.length > 0 && (
					<>
						<CommandSeparator />
						<CommandGroup heading="Employees">
							{employees.map((emp) => (
								<CommandItem
									key={emp.id}
									onSelect={() => go(`/employees/${emp.id}`)}
									value={`${emp.full_name} ${emp.email ?? ""}`}
								>
									<UserCircle className="size-4 mr-2" aria-hidden />
									{emp.full_name}
									{emp.email && (
										<span className="ml-2 text-text-tertiary text-small">{emp.email}</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</>
				)}

				<CommandSeparator />
				<CommandGroup heading="Actions">
					<CommandItem onSelect={() => go("/schedule/me")} value="Clock in / out">
						<Clock className="size-4 mr-2" aria-hidden /> Clock in / out
					</CommandItem>
					<CommandItem onSelect={() => go("/leave/apply")} value="Apply for leave">
						<Calendar className="size-4 mr-2" aria-hidden /> Apply for leave
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
