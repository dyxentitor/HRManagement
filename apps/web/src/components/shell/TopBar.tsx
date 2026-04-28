import { Bell, HelpCircle, Search } from "lucide-react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/lib/cmdk";

import { UserMenu } from "./UserMenu";

function deriveTitle(pathname: string): { breadcrumb: string; title: string } {
	const segs = pathname.split("/").filter(Boolean);
	if (segs.length === 0) return { breadcrumb: "Home", title: "Dashboard" };
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
	const { breadcrumb, title } = deriveTitle(pathname);
	const { setOpen } = useCommandPalette();

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
			>
				<HelpCircle className="size-4" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="rounded-md bg-canvas border border-border-subtle hover:bg-surface-hover relative"
				aria-label="Notifications"
			>
				<Bell className="size-4" />
				{/* unread pulse — wired in Sub-plan 2 (NotificationCard) */}
			</Button>
			<UserMenu variant="full" />
		</header>
	);
}
