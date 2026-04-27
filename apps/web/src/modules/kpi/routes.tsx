import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyKpiPage = lazy(() => import("./pages/MyKpiPage"));
const KpiManagerPage = lazy(() => import("./pages/KpiManagerPage"));
const KpiAdminPage = lazy(() => import("./pages/KpiAdminPage"));

export const kpiRoutes: RouteObject[] = [
	{ path: "kpi/me", element: <MyKpiPage /> },
	{ path: "kpi/manager", element: <KpiManagerPage /> },
	{ path: "kpi/admin", element: <KpiAdminPage /> },
];
