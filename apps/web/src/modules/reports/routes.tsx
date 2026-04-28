import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const ReportsListPage = lazy(() => import("./pages/ReportsListPage"));
const ReportRunPage = lazy(() => import("./pages/ReportRunPage"));

export const reportsRoutes: RouteObject[] = [
	{ path: "reports", element: <ReportsListPage /> },
	{ path: "reports/:code", element: <ReportRunPage /> },
];
