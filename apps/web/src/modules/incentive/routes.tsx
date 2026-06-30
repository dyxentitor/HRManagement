import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyIncentivePage = lazy(() => import("./pages/MyIncentivePage"));
const IncentiveAdminPage = lazy(() => import("./pages/IncentiveAdminPage"));

export const incentiveRoutes: RouteObject[] = [
	{ path: "/incentive", element: <MyIncentivePage /> },
	{ path: "/admin/incentive", element: <IncentiveAdminPage /> },
];
