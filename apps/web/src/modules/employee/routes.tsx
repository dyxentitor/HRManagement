import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeDetailPage = lazy(() => import("./pages/EmployeeDetailPage"));

export const employeeRoutes: RouteObject[] = [
	{ path: "/me/profile", element: <MyProfilePage /> },
	{ path: "/employees", element: <EmployeesPage /> },
	{ path: "/employees/:id", element: <EmployeeDetailPage /> },
];
