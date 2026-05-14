import { Outlet } from "react-router-dom";

import { SettingsNav } from "./SettingsNav";

export default function SettingsShell() {
	return (
		<div className="flex gap-3 min-h-[calc(100vh-32px)]">
			<SettingsNav />
			<main className="flex-1 bg-surface rounded-lg p-6 overflow-auto">
				<Outlet />
			</main>
		</div>
	);
}
