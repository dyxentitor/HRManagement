import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const AdminRolesPage = lazy(() => import("./pages/AdminRolesPage"));
const AdminRoleDetailPage = lazy(() => import("./pages/AdminRoleDetailPage"));
const AdminModulesPage = lazy(() => import("./pages/AdminModulesPage"));
const AdminTeamsPage = lazy(() => import("./pages/AdminTeamsPage"));
const AdminLeaveTypesPage = lazy(() => import("./pages/AdminLeaveTypesPage"));

export const adminRoutes: RouteObject[] = [
	{ path: "/admin/roles", element: <AdminRolesPage /> },
	{ path: "/admin/roles/:code", element: <AdminRoleDetailPage /> },
	{ path: "/admin/modules", element: <AdminModulesPage /> },
	{ path: "/admin/teams", element: <AdminTeamsPage /> },
	{ path: "/admin/leave-types", element: <AdminLeaveTypesPage /> },
];
