import { Link, useNavigate } from "react-router-dom";

import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/perm";

export function TopBar() {
	const { user, logout } = useAuth();
	const navigate = useNavigate();
	const canLeave = useCan("leave:request:create:self");
	const canApprovals = useCan("approvals:inbox:read");
	const canSchedule = useCan("attendance:clock:self");
	const canRoster = useCan("schedule:assignment:write:team");
	const canClaims = useCan("claim:create:self");
	const canPayslips = useCan("payslip:read:self");
	const canPayroll = useCan("payroll:run:create");
	const canKpi = useCan("kpi:assignment:read:self");
	const canKpiAdmin = useCan("kpi:cycle:write");
	const canCerts = useCan("cert:read:self");
	const canTraining = useCan("training:assignment:read:self");
	const canCertAdmin = useCan("cert:read:org");

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
							to="/approvals"
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
					{canClaims && (
						<Link
							to="/claims/me"
							className="text-slate-600 hover:text-slate-900"
						>
							Claims
						</Link>
					)}
					{canPayslips && (
						<Link
							to="/payslips/me"
							className="text-slate-600 hover:text-slate-900"
						>
							Payslips
						</Link>
					)}
					{canPayroll && (
						<Link
							to="/payroll/admin"
							className="text-slate-600 hover:text-slate-900"
						>
							Payroll
						</Link>
					)}
					{canKpi && (
						<Link to="/kpi/me" className="text-slate-600 hover:text-slate-900">
							KPI
						</Link>
					)}
					{canKpiAdmin && (
						<Link
							to="/kpi/admin"
							className="text-slate-600 hover:text-slate-900"
						>
							KPI Admin
						</Link>
					)}
					{canCerts && (
						<Link
							to="/certifications/me"
							className="text-slate-600 hover:text-slate-900"
						>
							Certs
						</Link>
					)}
					{canTraining && (
						<Link
							to="/training/me"
							className="text-slate-600 hover:text-slate-900"
						>
							Training
						</Link>
					)}
					{canCertAdmin && (
						<Link
							to="/certifications/admin"
							className="text-slate-600 hover:text-slate-900"
						>
							Cert Admin
						</Link>
					)}
					<NotificationBell />
					<Link
						to="/notifications/preferences"
						className="text-slate-600 hover:text-slate-900"
					>
						Notif. Prefs
					</Link>
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
