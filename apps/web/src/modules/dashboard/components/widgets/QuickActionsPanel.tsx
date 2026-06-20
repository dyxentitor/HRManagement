import {
	CalendarPlus,
	FileSpreadsheet,
	Inbox,
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
	/** permission gate; "" = always */
	perm: string;
}

// Routes here must already exist in the app router.
const ACTIONS: Action[] = [
	{ label: "Add employee", to: "/employees/new", icon: UserPlus, perm: "employee:create" },
	{ label: "Approvals inbox", to: "/approvals", icon: Inbox, perm: "approvals:inbox:read" },
	{ label: "Run payroll", to: "/payroll/admin", icon: Wallet, perm: "payroll:run:create" },
	{ label: "Generate report", to: "/reports", icon: FileSpreadsheet, perm: "report:list" },
	{ label: "Apply for leave", to: "/leave/me", icon: CalendarPlus, perm: "leave:request:create:self" },
	{ label: "Submit a claim", to: "/claims/me", icon: Receipt, perm: "claim:create:self" },
	{ label: "My profile", to: "/me/profile", icon: UserCircle, perm: "" },
];

export function QuickActionsPanel({ perms }: { perms: Set<string> }) {
	const visible = ACTIONS.filter((a) => a.perm === "" || perms.has(a.perm));
	return (
		<aside className="bg-surface-hover border border-border-subtle rounded-lg p-4">
			<h3 className="text-label font-semibold text-text-secondary mb-3">
				Quick actions
			</h3>
			<ul className="flex flex-col gap-1.5">
				{visible.map((a) => (
					<li key={a.to}>
						<Link
							to={a.to}
							className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors duration-fast min-h-[44px]"
						>
							<span className="size-7 rounded-md bg-canvas/60 grid place-items-center shrink-0">
								<a.icon className="size-4 text-accent-200" aria-hidden />
							</span>
							{a.label}
						</Link>
					</li>
				))}
			</ul>
		</aside>
	);
}
