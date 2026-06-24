import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const ActionCenterPage = lazy(() => import("./pages/ActionCenterPage"));
const AssignmentsAdminPage = lazy(() => import("./pages/AssignmentsAdminPage"));
const AssignmentCreatePage = lazy(() => import("./pages/AssignmentCreatePage"));
const QuestionnairePage = lazy(() => import("./pages/QuestionnairePage"));

export const assignmentsRoutes: RouteObject[] = [
	{ path: "/action-center", element: <ActionCenterPage /> },
	{ path: "/action-center/q/:id", element: <QuestionnairePage /> },
	{ path: "/admin/assignments", element: <AssignmentsAdminPage /> },
	{ path: "/admin/assignments/new", element: <AssignmentCreatePage /> },
];
