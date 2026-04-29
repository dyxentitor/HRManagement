import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const NotificationPreferencesPage = lazy(
	() => import("./pages/PreferencesPage"),
);
const UserPreferencesPage = lazy(
	() => import("@/modules/auth/pages/PreferencesPage"),
);

export const notificationsRoutes: RouteObject[] = [
	{
		path: "notifications/preferences",
		element: <NotificationPreferencesPage />,
	},
	// Legacy path — redirect to unified preferences
	{
		path: "notifications/prefs",
		element: <Navigate to="/me/preferences" replace />,
	},
	{ path: "me/preferences", element: <UserPreferencesPage /> },
];
