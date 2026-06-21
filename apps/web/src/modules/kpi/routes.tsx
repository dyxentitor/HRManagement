import type { RouteObject } from "react-router-dom";

import { ComingSoon } from "@/components/hrms";

// KPIs are being reworked — every KPI route shows a "coming soon" placeholder for
// now. The pages (MyKpiPage / KpiManagerPage / KpiAdminPage) and the backend stay
// in the repo; swap these elements back when the rework ships.
const KpiComingSoon = () => (
	<ComingSoon
		eyebrow="Performance & KPIs"
		title="KPIs are getting a rework"
		message="We're rebuilding performance management into something much better — clearer goals, lightweight check-ins, and fairer reviews. It'll be back soon."
		highlights={[
			"Goal setting & alignment",
			"Regular check-ins",
			"Streamlined performance reviews",
		]}
	/>
);

export const kpiRoutes: RouteObject[] = [
	{ path: "kpi/me", element: <KpiComingSoon /> },
	{ path: "kpi/manager", element: <KpiComingSoon /> },
	{ path: "kpi/admin", element: <KpiComingSoon /> },
];
