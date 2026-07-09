import { Outlet } from "react-router-dom";

import { SettingsNav } from "./SettingsNav";

export default function SettingsShell() {
	return (
		<div className="flex gap-3 min-h-[calc(100vh-32px)]">
			<SettingsNav />
			{/* Not <main> — AppShell already owns the single main landmark. */}
			<div className="flex-1 bg-surface rounded-lg p-6 overflow-auto">
				<Outlet />
			</div>
		</div>
	);
}
