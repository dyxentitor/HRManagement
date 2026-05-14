import { lazy } from "react";
import { Navigate, type RouteObject, useParams } from "react-router-dom";

const AdminRolesPage = lazy(() => import("./pages/AdminRolesPage"));
const AdminRoleDetailPage = lazy(() => import("./pages/AdminRoleDetailPage"));
const AdminModulesPage = lazy(() => import("./pages/AdminModulesPage"));
const AdminTeamsPage = lazy(() => import("./pages/AdminTeamsPage"));
const AdminLeaveTypesPage = lazy(() => import("./pages/AdminLeaveTypesPage"));

const SettingsShell = lazy(() => import("./settings/SettingsShell"));
const SettingsOverviewPage = lazy(
	() => import("./settings/SettingsOverviewPage"),
);
const OrganizationSettingsPage = lazy(
	() => import("./settings/OrganizationSettingsPage"),
);
const DepartmentsAdminPage = lazy(
	() => import("./settings/DepartmentsAdminPage"),
);
const UsersLinkingPage = lazy(() => import("./settings/UsersLinkingPage"));
const ArchivedEmployeesPage = lazy(
	() => import("./settings/ArchivedEmployeesPage"),
);

function RedirectRoleDetail() {
	const { code } = useParams<{ code: string }>();
	return <Navigate to={`/admin/settings/roles/${code}`} replace />;
}

export const adminRoutes: RouteObject[] = [
	// Legacy routes redirect into the new Settings shell (preserve deep links).
	{
		path: "/admin/roles",
		element: <Navigate to="/admin/settings/roles" replace />,
	},
	{ path: "/admin/roles/:code", element: <RedirectRoleDetail /> },
	{
		path: "/admin/modules",
		element: <Navigate to="/admin/settings/modules" replace />,
	},
	{
		path: "/admin/teams",
		element: <Navigate to="/admin/settings/teams" replace />,
	},
	{
		path: "/admin/leave-types",
		element: <Navigate to="/admin/settings/leave-types" replace />,
	},

	// v1.9.0 — Settings shell with nested children.
	{
		path: "/admin/settings",
		element: <SettingsShell />,
		children: [
			{ index: true, element: <SettingsOverviewPage /> },
			{ path: "organization", element: <OrganizationSettingsPage /> },
			{ path: "modules", element: <AdminModulesPage /> },
			{ path: "departments", element: <DepartmentsAdminPage /> },
			{ path: "teams", element: <AdminTeamsPage /> },
			{ path: "users", element: <UsersLinkingPage /> },
			{ path: "archived", element: <ArchivedEmployeesPage /> },
			{ path: "roles", element: <AdminRolesPage /> },
			{ path: "roles/:code", element: <AdminRoleDetailPage /> },
			{ path: "leave-types", element: <AdminLeaveTypesPage /> },
		],
	},
];
