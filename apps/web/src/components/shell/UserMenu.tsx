import { Link } from "react-router-dom";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

function initialsOf(email: string): string {
	const local = email.split("@")[0] ?? email;
	return local.slice(0, 2).toUpperCase();
}

interface UserMenuProps {
	variant?: "compact" | "full";
}

export function UserMenu({ variant = "full" }: UserMenuProps) {
	const { user, logout, roles } = useAuth();
	if (!user) return null;
	const initial = initialsOf(user.email);
	const role = roles[0] ?? "Member";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account menu"
				className="flex items-center gap-2 rounded-full bg-canvas border border-border-subtle px-1 py-1 pr-3 hover:bg-surface-hover transition-colors duration-fast"
			>
				<span className="size-7 rounded-full bg-gradient-to-br from-lavender to-mint grid place-items-center text-canvas font-bold text-small">
					{initial}
				</span>
				{variant === "full" && (
					<span className="text-left">
						<span className="block text-h3 text-text-primary leading-tight">
							{user.email.split("@")[0]}
						</span>
						<span className="block text-small text-text-tertiary leading-tight">
							{role}
						</span>
					</span>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="bg-surface-elevated border-border-subtle min-w-48"
			>
				<DropdownMenuLabel className="text-text-tertiary text-label">
					{user.email}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/me/profile">Profile</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/me/preferences">Preferences</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void logout();
					}}
					className="text-coral focus:text-coral"
				>
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
