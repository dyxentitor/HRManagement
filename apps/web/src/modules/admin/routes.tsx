import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const AdminRolesPage = lazy(() => import("./pages/AdminRolesPage"));
const AdminRoleDetailPage = lazy(() => import("./pages/AdminRoleDetailPage"));
const AdminModulesPage = lazy(() => import("./pages/AdminModulesPage"));

export const adminRoutes: RouteObject[] = [
	{ path: "/admin/roles", element: <AdminRolesPage /> },
	{ path: "/admin/roles/:code", element: <AdminRoleDetailPage /> },
	{ path: "/admin/modules", element: <AdminModulesPage /> },
];
