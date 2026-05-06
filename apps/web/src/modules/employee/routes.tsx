import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeDetailPage = lazy(() => import("./pages/EmployeeDetailPage"));
const EmployeeFormPage = lazy(() => import("./pages/EmployeeFormPage"));

export const employeeRoutes: RouteObject[] = [
	{ path: "/me/profile", element: <MyProfilePage /> },
	{ path: "/employees", element: <EmployeesPage /> },
	{ path: "/employees/new", element: <EmployeeFormPage /> },
	{ path: "/employees/:id", element: <EmployeeDetailPage /> },
	{ path: "/employees/:id/edit", element: <EmployeeFormPage /> },
];
