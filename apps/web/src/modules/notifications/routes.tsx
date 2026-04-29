import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const PreferencesPage = lazy(() => import("./pages/PreferencesPage"));

export const notificationsRoutes: RouteObject[] = [
	{ path: "notifications/preferences", element: <PreferencesPage /> },
	// Legacy path — redirect to unified preferences
	{
		path: "notifications/prefs",
		element: <Navigate to="/me/preferences" replace />,
	},
];
