import { Outlet } from "react-router-dom";

import { SignedOutGate } from "../SignedOutGate";

import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
	return (
		<SignedOutGate>
			<div className="min-h-screen bg-canvas p-4 grid grid-cols-[220px_1fr] gap-4">
				<Sidebar />
				<div className="flex flex-col gap-4 min-w-0">
					<TopBar />
					<main id="main" className="flex-1 bg-surface rounded-lg p-6 min-w-0">
						<a
							href="#main"
							className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-accent-500 text-white px-3 py-2 rounded-md text-small font-semibold"
						>
							Skip to main content
						</a>
						<Outlet />
					</main>
				</div>
				<CommandPalette />
			</div>
		</SignedOutGate>
	);
}
