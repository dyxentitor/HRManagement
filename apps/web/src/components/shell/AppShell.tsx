import { Outlet } from "react-router-dom";

import { SignedOutGate } from "../SignedOutGate";

import { TopBar } from "./TopBar";

export function AppShell() {
	return (
		<SignedOutGate>
			<div className="min-h-screen flex flex-col">
				<TopBar />
				<main className="flex-1 p-4">
					<Outlet />
				</main>
			</div>
		</SignedOutGate>
	);
}
