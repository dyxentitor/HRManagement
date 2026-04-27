import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));

export const employeeRoutes: RouteObject[] = [
	{ path: "/me/profile", element: <MyProfilePage /> },
];
