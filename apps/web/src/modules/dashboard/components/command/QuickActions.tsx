import {
	CalendarPlus,
	FileSpreadsheet,
	Inbox,
	Megaphone,
	Receipt,
	UserCircle,
	UserPlus,
	Wallet,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";

interface Action {
	label: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
	perm: string;
}

// Routes must already exist in the app router.
const ACTIONS: Action[] = [
	{ label: "Add employee", to: "/employees/new", icon: UserPlus, perm: "employee:create" },
	{ label: "Approvals inbox", to: "/approvals", icon: Inbox, perm: "approvals:inbox:read" },
	{ label: "Run payroll", to: "/payroll/admin", icon: Wallet, perm: "payroll:run:create" },
	{ label: "Generate report", to: "/reports", icon: FileSpreadsheet, perm: "report:list" },
	{ label: "Announcements", to: "/admin/settings/announcements", icon: Megaphone, perm: "announcement:write" },
	{ label: "Apply for leave", to: "/leave/me", icon: CalendarPlus, perm: "leave:request:create:self" },
	{ label: "Submit a claim", to: "/claims/me", icon: Receipt, perm: "claim:create:self" },
	{ label: "My profile", to: "/me/profile", icon: UserCircle, perm: "" },
];

export function QuickActions({ perms }: { perms: Set<string> }) {
	const visible = ACTIONS.filter((a) => a.perm === "" || perms.has(a.perm));
	return (
		<div className="rounded-xl p-5 border border-border-subtle bg-surface-hover">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Quick actions
			</h3>
			<div className="grid grid-cols-2 gap-2">
				{visible.map((a) => (
					<Link
						key={a.to}
						to={a.to}
						className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-canvas/30 border border-transparent text-small text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors duration-fast min-h-[44px]"
					>
						<span className="size-6 rounded-lg bg-accent-500/20 grid place-items-center shrink-0">
							<a.icon className="size-3.5 text-accent-200" aria-hidden />
						</span>
						{a.label}
					</Link>
				))}
			</div>
		</div>
	);
}
