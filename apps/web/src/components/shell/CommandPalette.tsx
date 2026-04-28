import {
	Calendar,
	Clock,
	FileSpreadsheet,
	Inbox,
	LayoutDashboard,
	Receipt,
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
	},
	{
		label: "Schedule",
		to: "/schedule/me",
		icon: Clock,
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
		label: "Approvals",
		to: "/approvals",
		icon: Inbox,
		perm: "approvals:inbox:read",
	},
	{
		label: "Employees",
		to: "/employees",
		icon: Users,
		perm: "employee:read:org",
	},
	{
		label: "Reports",
		to: "/reports",
		icon: FileSpreadsheet,
		perm: "report:list",
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

	const visiblePages = PAGES.filter((_, i) => pagePerms[i]);

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
										<span className="ml-2 text-text-tertiary text-small">
											{emp.email}
										</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</>
				)}

				<CommandSeparator />
				<CommandGroup heading="Actions">
					<CommandItem
						onSelect={() => go("/schedule/me")}
						value="Clock in / out"
					>
						<Clock className="size-4 mr-2" aria-hidden /> Clock in / out
					</CommandItem>
					<CommandItem
						onSelect={() => go("/leave/apply")}
						value="Apply for leave"
					>
						<Calendar className="size-4 mr-2" aria-hidden /> Apply for leave
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
