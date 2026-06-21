import { lazy } from "react";
import { Navigate, type RouteObject } from "react-router-dom";

const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));
const EmployeeDetailPage = lazy(() => import("./pages/EmployeeDetailPage"));
const EmployeeFormPage = lazy(() => import("./pages/EmployeeFormPage"));

export const employeeRoutes: RouteObject[] = [
	{ path: "/me/profile", element: <MyProfilePage /> },
	// The employee list now lives in the People hub (Directory tab).
	{ path: "/employees", element: <Navigate to="/admin/people" replace /> },
	{ path: "/employees/new", element: <EmployeeFormPage /> },
	{ path: "/employees/:id", element: <EmployeeDetailPage /> },
	{ path: "/employees/:id/edit", element: <EmployeeFormPage /> },
];
