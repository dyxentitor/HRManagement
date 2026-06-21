import { Outlet } from "react-router-dom";

import { PeopleNav } from "./PeopleNav";

export default function PeopleShell() {
	return (
		<div className="flex gap-3 min-h-[calc(100vh-32px)]">
			<PeopleNav />
			<main className="flex-1 bg-surface rounded-lg p-6 overflow-auto">
				<Outlet />
			</main>
		</div>
	);
}
