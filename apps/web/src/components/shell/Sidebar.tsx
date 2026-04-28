import { Search } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import { UserMenu } from "./UserMenu";
import { NAV, type NavItem } from "./sidebar-nav";

// Flatten all NAV items in a stable, module-level order so the hook call count
// is fixed at build time — React requires the same number of hook calls every render.
const ALL_ITEMS = NAV.flatMap((g) => g.items);

function NavItemLink({ item }: { item: NavItem }) {
	const Icon = item.icon;
	return (
		<NavLink
			to={item.to}
			end={item.to === "/"}
			className={({ isActive }) =>
				cn(
					"flex items-center gap-2 rounded-md px-2.5 py-1.5 text-h3 text-text-secondary transition-colors duration-fast",
					"hover:bg-surface-hover hover:text-text-primary",
					isActive
						? "bg-gradient-to-r from-accent-500/30 to-accent-500/[0.05] text-accent-200 shadow-[inset_0_0_0_1px_rgb(var(--accent-500)/0.4)]"
						: "",
				)
			}
		>
			<Icon className="size-4 shrink-0" aria-hidden />
			<span className="flex-1">{item.label}</span>
		</NavLink>
	);
}

export function Sidebar() {
	// Call useCan for every NAV item exactly once, in stable module-level order.
	// ALL_ITEMS is a module-level constant so the hook count never changes across renders.
	// eslint-disable-next-line react-hooks/rules-of-hooks
	const canFlags = ALL_ITEMS.map((item) =>
		item.perm === "" ? true : useCan(item.perm),
	);

	// Build a visibility map keyed by route path.
	// canFlags is a tiny boolean array (~14 items) — building a Map inline is negligible.
	const visibleByPath = new Map<string, boolean>(
		ALL_ITEMS.map((item, i) => [item.to, canFlags[i] ?? false]),
	);

	const isVisible = (item: NavItem) => visibleByPath.get(item.to) ?? false;

	const personalGroup = NAV[0];
	const teamGroup = NAV[1];
	const adminGroup = NAV[2];

	const visiblePersonal = personalGroup?.items.filter(isVisible) ?? [];
	// Dashboard is always first in Personal and always visible (perm: "").
	// We show it standalone (without a group label) per the design; the remaining
	// Personal items get the "Personal" group label.
	const [dashboardItem, ...personalRest] = visiblePersonal;

	const visibleTeam = teamGroup?.items.filter(isVisible) ?? [];
	const visibleAdmin = adminGroup?.items.filter(isVisible) ?? [];

	return (
		<aside className="flex flex-col bg-surface rounded-lg p-3 w-[220px] shrink-0">
			<div className="flex items-center gap-2 px-2.5 pt-1 pb-3">
				<span
					className="size-[22px] rounded-md bg-gradient-to-br from-accent-500 to-lavender"
					aria-hidden
				/>
				<span className="text-h3 font-bold tracking-wider text-text-primary">
					PROVINTELL
				</span>
			</div>

			<button
				type="button"
				className="mx-1 mb-3 flex items-center gap-2 rounded-md bg-canvas border border-border-subtle px-2.5 py-2 text-small text-text-tertiary hover:text-text-secondary"
				aria-label="Open command palette"
			>
				<Search className="size-3.5" aria-hidden />
				<span>⌘K · Search…</span>
			</button>

			{/* Dashboard — always visible, no group label */}
			{dashboardItem && <NavItemLink item={dashboardItem} />}

			{/* Personal group — label + remaining personal items */}
			{personalRest.length > 0 && (
				<>
					<div className="text-label text-text-disabled px-2.5 pt-3 pb-1">
						Personal
					</div>
					{personalRest.map((item) => (
						<NavItemLink key={item.to} item={item} />
					))}
				</>
			)}

			{/* Team group — only rendered when at least one item is visible */}
			{visibleTeam.length > 0 && (
				<>
					<div className="text-label text-text-disabled px-2.5 pt-3 pb-1">
						Team
					</div>
					{visibleTeam.map((item) => (
						<NavItemLink key={item.to} item={item} />
					))}
				</>
			)}

			{/* Admin group — only rendered when at least one item is visible */}
			{visibleAdmin.length > 0 && (
				<>
					<div className="text-label text-text-disabled px-2.5 pt-3 pb-1">
						Admin
					</div>
					{visibleAdmin.map((item) => (
						<NavItemLink key={item.to} item={item} />
					))}
				</>
			)}

			<div className="mt-auto pt-3 border-t border-border-subtle">
				<UserMenu variant="full" />
			</div>
		</aside>
	);
}
