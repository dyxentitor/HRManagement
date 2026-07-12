import { NavLink } from "react-router-dom";

import { OrgLogo } from "@/components/hrms/OrgLogo";
import { useAuth } from "@/lib/auth";
import { useFeature } from "@/lib/feature-flags";
import { type NavBadges, useNavBadges } from "@/lib/nav-badges";
import { cn } from "@/lib/utils";

import { UserMenu } from "./UserMenu";
import { NAV, type NavItem } from "./sidebar-nav";

// Flatten all NAV items in a stable, module-level order so the feature-flag hook
// count is fixed at build time — React requires the same number of hook calls each render.
const ALL_ITEMS = NAV.flatMap((g) => g.items);

// Nav paths that are a strict prefix of another nav item's path (e.g. "/feedback" is a
// parent of "/feedback/manage"). NavLink prefix-matches by default, which would light up
// BOTH parent and child when the child route is active — so parents must match exactly.
const PARENT_PATHS = new Set(
	ALL_ITEMS.filter((item) =>
		ALL_ITEMS.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`)),
	).map((item) => item.to),
);

function NavItemLink({ item, count }: { item: NavItem; count?: number }) {
	const Icon = item.icon;
	return (
		<NavLink
			to={item.to}
			end={item.to === "/" || PARENT_PATHS.has(item.to)}
			className={({ isActive }) =>
				cn(
					"group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-text-secondary transition-colors duration-fast",
					"hover:bg-white/[0.04] hover:text-text-primary",
					isActive &&
						"bg-accent-500/10 font-medium text-text-primary before:absolute before:-left-0.5 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-accent-500",
				)
			}
		>
			{({ isActive }) => (
				<>
					<Icon
						className={cn(
							"size-4 shrink-0 transition-colors",
							isActive
								? "text-accent-200"
								: "text-text-tertiary group-hover:text-text-secondary",
						)}
						aria-hidden
					/>
					<span className="flex-1 truncate">{item.label}</span>
					{count ? (
						<span
							className={cn(
								"ml-auto grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
								item.badge === "approvals"
									? "bg-coral/15 text-coral"
									: "bg-accent-500/20 text-accent-200",
							)}
						>
							{count > 99 ? "99+" : count}
						</span>
					) : null}
				</>
			)}
		</NavLink>
	);
}

export function Sidebar() {
	// Read the permission set once, then evaluate each item with plain predicates —
	// this supports `anyPerm` (OR) and avoids a permission hook per item.
	const { perms } = useAuth();
	const has = (p: string) => Boolean(perms?.has(p));
	const canItem = (item: NavItem): boolean => {
		if (item.anyPerm?.length) return item.anyPerm.some(has);
		return item.perm === "" ? true : has(item.perm);
	};

	// Feature flags read per-item from the flags context (stable hook count —
	// ALL_ITEMS is a module-level constant).
	// biome-ignore lint/correctness/useHookAtTopLevel: ALL_ITEMS is module-constant; hook count fixed.
	const featureFlags = ALL_ITEMS.map((item) => (item.module ? useFeature(item.module) : true));
	const flagByPath = new Map(ALL_ITEMS.map((item, i) => [item.to, featureFlags[i] ?? true]));

	const badges = useNavBadges();
	const badgeFor = (item: NavItem): number | undefined =>
		item.badge ? badges[item.badge as keyof NavBadges] : undefined;

	const isVisible = (item: NavItem) => canItem(item) && (flagByPath.get(item.to) ?? true);

	// Resolve each group to its visible items; drop empty groups.
	const groups = NAV.map((g) => ({ ...g, items: g.items.filter(isVisible) })).filter(
		(g) => g.items.length > 0,
	);

	return (
		<aside className="flex w-[224px] shrink-0 flex-col rounded-lg bg-surface p-3">
			<div className="flex items-center gap-2 px-2.5 pb-9 pt-1.5">
				<OrgLogo />
			</div>

			<nav className="flex flex-col gap-0.5">
				{groups.map((group) => (
					<div key={group.id} className="flex flex-col gap-0.5">
						{group.label && (
							<div className="px-2.5 pb-1 pt-4">
								<span className="text-label uppercase tracking-wider text-text-disabled">
									{group.label}
								</span>
							</div>
						)}
						{group.items.map((item) => (
							<NavItemLink key={item.to} item={item} count={badgeFor(item)} />
						))}
					</div>
				))}
			</nav>

			<div className="mt-auto border-t border-border-subtle pt-3">
				<UserMenu variant="full" />
			</div>
		</aside>
	);
}
