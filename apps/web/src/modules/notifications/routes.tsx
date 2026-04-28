import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const PreferencesPage = lazy(() => import("./pages/PreferencesPage"));

export const notificationsRoutes: RouteObject[] = [
	{ path: "notifications/preferences", element: <PreferencesPage /> },
];
