import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));

export const employeeRoutes: RouteObject[] = [
	{ path: "/me/profile", element: <MyProfilePage /> },
	{ path: "/employees", element: <EmployeesPage /> },
];
