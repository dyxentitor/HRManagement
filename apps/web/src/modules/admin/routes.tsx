import { lazy } from "react";
import { Navigate, type RouteObject, useParams } from "react-router-dom";

const AdminRolesPage = lazy(() => import("./pages/AdminRolesPage"));
const AdminModulesPage = lazy(() => import("./pages/AdminModulesPage"));
const AdminTeamsPage = lazy(() => import("./pages/AdminTeamsPage"));
const AdminLeaveTypesPage = lazy(() => import("./pages/AdminLeaveTypesPage"));
const AdminAnnouncementsPage = lazy(() => import("./pages/AdminAnnouncementsPage"));
const AdminAuditLogPage = lazy(() => import("./pages/AdminAuditLogPage"));

const SettingsShell = lazy(() => import("./settings/SettingsShell"));
const SettingsOverviewPage = lazy(() => import("./settings/SettingsOverviewPage"));
const OrganizationSettingsPage = lazy(() => import("./settings/OrganizationSettingsPage"));
const DepartmentsAdminPage = lazy(() => import("./settings/DepartmentsAdminPage"));
const UsersLinkingPage = lazy(() => import("./settings/UsersLinkingPage"));
const UserCreatePage = lazy(() =>
	import("./settings/UserCreatePage").then((m) => ({
		default: m.UserCreatePage,
	})),
);
const ArchivedEmployeesPage = lazy(() => import("./settings/ArchivedEmployeesPage"));
const PeopleShell = lazy(() => import("./people/PeopleShell"));
const EmployeesPage = lazy(() => import("@/modules/employee/pages/EmployeesPage"));
const OnboardingHubPage = lazy(() => import("./people/OnboardingHubPage"));

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
			// Moved to the People hub (v1.25.0) — redirect old links.
			{ path: "users", element: <Navigate to="/admin/people/accounts" replace /> },
			{ path: "users/new", element: <Navigate to="/admin/people/accounts/new" replace /> },
			{ path: "invitations", element: <Navigate to="/admin/people/onboarding" replace /> },
			{ path: "archived", element: <ArchivedEmployeesPage /> },
			{ path: "roles", element: <AdminRolesPage /> },
			{ path: "roles/:code", element: <AdminRolesPage /> },
			{ path: "leave-types", element: <AdminLeaveTypesPage /> },
			{ path: "announcements", element: <AdminAnnouncementsPage /> },
			{ path: "audit", element: <AdminAuditLogPage /> },
		],
	},

	// v1.25.0 — dedicated People hub (Directory · Invitations · Accounts).
	{
		path: "/admin/people",
		element: <PeopleShell />,
		children: [
			{ index: true, element: <EmployeesPage /> },
			{ path: "onboarding", element: <OnboardingHubPage /> },
			// Invitations merged into the Onboarding hub — keep the old link working.
			{ path: "invitations", element: <Navigate to="/admin/people/onboarding" replace /> },
			{ path: "accounts", element: <UsersLinkingPage /> },
			{ path: "accounts/new", element: <UserCreatePage /> },
		],
	},
];
