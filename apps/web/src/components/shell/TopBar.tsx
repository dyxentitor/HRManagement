import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";

export function TopBar() {
	const { user, logout } = useAuth();
	const navigate = useNavigate();

	return (
		<header className="border-b bg-white">
			<div className="px-4 py-3 flex items-center justify-between">
				<div className="font-semibold">HRMS</div>
				<div className="flex items-center gap-3 text-sm">
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
