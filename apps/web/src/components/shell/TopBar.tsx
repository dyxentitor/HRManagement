import { Bell, HelpCircle, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { NotificationDropdown } from "@/modules/notifications/components/NotificationDropdown";
import { useNotifications } from "@/modules/notifications/useNotifications";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { useCommandPalette } from "@/lib/cmdk";
import { NAV } from "./sidebar-nav";

import { UserMenu } from "./UserMenu";

function deriveTitle(
	pathname: string,
	firstName?: string,
): { breadcrumb: string; title: string } {
	// Dashboard at "/"
	if (pathname === "/" || pathname === "") {
		return { breadcrumb: firstName ?? "Home", title: "Dashboard" };
	}

	// Search NAV for an exact-match or prefix-match (for sub-pages like /reports/:code)
	for (const group of NAV) {
		for (const item of group.items) {
			// Exact match
			if (item.to === pathname) {
				return { breadcrumb: group.label || "Home", title: item.label };
			}
			// Prefix match for nested routes (e.g. /reports/some.code matches /reports)
			if (item.to !== "/" && pathname.startsWith(`${item.to}/`)) {
				return { breadcrumb: group.label || "Home", title: item.label };
			}
		}
	}

	// Fallback: auto-derive from path segments
	const segs = pathname.split("/").filter(Boolean);
	if (segs.length === 0)
		return { breadcrumb: firstName ?? "Home", title: "Dashboard" };
	const head = (segs[0] ?? "").replace(/-/g, " ");
	const tail = (segs[segs.length - 1] ?? "").replace(/-/g, " ");
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	return {
		breadcrumb: segs.slice(0, -1).map(cap).join(" / ") || cap(head),
		title: cap(tail),
	};
}

export function TopBar() {
	const { pathname } = useLocation();
	const { user } = useAuth();
	const firstName = user?.email?.split("@")[0];
	const { breadcrumb, title } = deriveTitle(pathname, firstName);
	const { setOpen } = useCommandPalette();
	const navigate = useNavigate();
	const { unreadCount } = useNotifications();

	return (
		<header className="bg-surface rounded-lg px-4 py-3 flex items-center gap-4">
			<div className="flex-1">
				<p className="text-small text-text-tertiary leading-tight">
					{breadcrumb}
				</p>
				<h1 className="text-h2 text-text-primary leading-tight">{title}</h1>
			</div>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="hidden md:flex items-center gap-2 bg-canvas border border-border-subtle rounded-full px-4 py-1.5 text-small text-text-tertiary hover:text-text-secondary w-80"
				aria-label="Open command palette"
			>
				<Search className="size-3.5" aria-hidden />
				<span>⌘K · Search people, claims, leave…</span>
			</button>
			<Button
				variant="ghost"
				size="icon"
				className="rounded-md bg-canvas border border-border-subtle hover:bg-surface-hover"
				aria-label="Help"
				onClick={() => navigate("/help")}
			>
				<HelpCircle className="size-4" />
			</Button>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="rounded-md bg-canvas border border-border-subtle hover:bg-surface-hover relative"
						aria-label={
							unreadCount > 0
								? `Notifications, ${unreadCount} unread`
								: "Notifications"
						}
					>
						<Bell className="size-4" />
						{unreadCount > 0 && (
							<span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-coral text-white text-[10px] font-bold flex items-center justify-center motion-safe:animate-pulse">
								{unreadCount > 9 ? "9+" : unreadCount}
							</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="p-0 w-80">
					<NotificationDropdown onNavigate={(p) => navigate(p)} />
				</PopoverContent>
			</Popover>
			<UserMenu variant="full" />
		</header>
	);
}
