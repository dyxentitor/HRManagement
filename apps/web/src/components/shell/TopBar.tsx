import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/perm";

export function TopBar() {
	const { user, logout } = useAuth();
	const navigate = useNavigate();
	const canLeave = useCan("leave:request:create:self");
	const canApprovals = useCan("leave:request:approve:team");
	const canSchedule = useCan("attendance:clock:self");
	const canRoster = useCan("schedule:assignment:write:team");

	return (
		<header className="border-b bg-white">
			<div className="px-4 py-3 flex items-center justify-between">
				<div className="font-semibold">HRMS</div>
				<div className="flex items-center gap-3 text-sm">
					<Link
						to="/me/profile"
						className="text-slate-600 hover:text-slate-900"
					>
						My Profile
					</Link>
					{canLeave && (
						<Link
							to="/leave/me"
							className="text-slate-600 hover:text-slate-900"
						>
							Leave
						</Link>
					)}
					{canApprovals && (
						<Link
							to="/leave/approvals"
							className="text-slate-600 hover:text-slate-900"
						>
							Approvals
						</Link>
					)}
					{canSchedule && (
						<Link
							to="/schedule/me"
							className="text-slate-600 hover:text-slate-900"
						>
							Schedule
						</Link>
					)}
					{canRoster && (
						<Link
							to="/schedule/roster"
							className="text-slate-600 hover:text-slate-900"
						>
							Roster
						</Link>
					)}
					<span aria-label="user-email">{user?.email}</span>
					<button
						type="button"
						onClick={async () => {
							await logout();
							navigate("/login");
						}}
						className="text-slate-600 hover:text-slate-900"
					>
						Log out
					</button>
				</div>
			</div>
		</header>
	);
}
