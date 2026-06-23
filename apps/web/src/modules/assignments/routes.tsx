import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const ActionCenterPage = lazy(() => import("./pages/ActionCenterPage"));
const AssignmentsAdminPage = lazy(() => import("./pages/AssignmentsAdminPage"));

export const assignmentsRoutes: RouteObject[] = [
	{ path: "/action-center", element: <ActionCenterPage /> },
	{ path: "/admin/assignments", element: <AssignmentsAdminPage /> },
];
