import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MySchedulePage = lazy(() => import("./pages/MySchedulePage"));
const RosterPage = lazy(() => import("./pages/RosterPage"));

export const scheduleRoutes: RouteObject[] = [
	{ path: "schedule/me", element: <MySchedulePage /> },
	{ path: "schedule/roster", element: <RosterPage /> },
];
