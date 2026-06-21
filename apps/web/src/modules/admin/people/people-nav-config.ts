import { ClipboardCheck, Link2, UsersRound } from "lucide-react";
import type { ComponentType } from "react";

export type PeopleNavBadge = "unlinked_users";

export interface PeopleNavItem {
	to: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	perm: string;
	end?: boolean;
	badge?: PeopleNavBadge;
}

export const PEOPLE_NAV_ITEMS: PeopleNavItem[] = [
	{
		to: "/admin/people",
		label: "Directory",
		icon: UsersRound,
		perm: "employee:read:org",
		end: true,
	},
	{
		to: "/admin/people/onboarding",
		label: "Onboarding",
		icon: ClipboardCheck,
		perm: "onboarding:read",
	},
	{
		to: "/admin/people/accounts",
		label: "Accounts",
		icon: Link2,
		perm: "employee:write:org",
		badge: "unlinked_users",
	},
];
