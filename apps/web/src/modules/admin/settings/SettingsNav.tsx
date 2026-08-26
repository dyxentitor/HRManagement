import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { useFeature } from "@/lib/feature-flags";
import { useCan } from "@/lib/perm";
import { cn } from "@/lib/utils";

import { type SettingsOverview, settingsApi } from "./settings-api";
import {
	SETTINGS_NAV_ITEMS,
	type SettingsNavItem,
} from "./settings-nav-config";

export function SettingsNav() {
	const [overview, setOverview] = useState<SettingsOverview | null>(null);
	const canSeeOverview = useCan("role:read");

	useEffect(() => {
		// v1.9.1 (M5): gate the overview fetch on the same perm that gates the
		// endpoint, so manager-tier users who land on /admin/settings/* don't
		// hit a 403 on every page mount.
		if (!canSeeOverview) return;
		settingsApi
			.overview()
			.then(setOverview)
			.catch(() => undefined);
	}, [canSeeOverview]);

	function badgeFor(badge?: string): number | null {
		if (badge === "unlinked_users" && overview) {
			const n = overview.attention.unlinked_users_count;
			return n > 0 ? n : null;
		}
		return null;
	}

	return (
		<aside className="flex flex-col bg-surface rounded-lg p-3 w-[220px] shrink-0">
			<div className="px-2 pt-1 pb-3 mb-2 border-b border-border-subtle">
				<h2 className="text-h4 font-bold text-text-primary">Settings</h2>
			</div>
			<nav className="flex flex-col gap-0.5">
				{SETTINGS_NAV_ITEMS.map((item) => (
					<NavItemRow key={item.to} item={item} badge={badgeFor(item.badge)} />
				))}
			</nav>
		</aside>
	);
}

function NavItemRow({
	item,
	badge,
}: {
	item: SettingsNavItem;
	badge: number | null;
}) {
	const allowed = useCan(item.perm);
	const moduleEnabled = useFeature(item.module ?? "");
	if (!allowed) return null;
	if (item.module && !moduleEnabled) return null;
	return (
		<NavLink
			to={item.to}
			end={item.to === "/admin/settings"}
			className={({ isActive }) =>
				cn(
					"flex items-center gap-2.5 px-2.5 py-2 rounded-md text-body",
					isActive
						? "bg-accent-500/15 text-text-primary font-semibold"
						: "text-text-secondary hover:bg-surface-hover",
				)
			}
		>
			<item.icon className="w-4 h-4" />
			<span className="flex-1">{item.label}</span>
			{item.isNewInV190 && (
				<span className="text-[10px] font-bold uppercase tracking-wider text-accent-200 bg-accent-500/15 px-1.5 py-0.5 rounded">
					New
				</span>
			)}
			{badge !== null && (
				<span className="text-[10px] font-bold text-white bg-coral px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
					{badge}
				</span>
			)}
		</NavLink>
	);
}
