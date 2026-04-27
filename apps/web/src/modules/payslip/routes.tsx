import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MyPayslipsPage = lazy(() => import("./pages/MyPayslipsPage"));
const PayrollAdminPage = lazy(() => import("./pages/PayrollAdminPage"));

export const payslipRoutes: RouteObject[] = [
	{ path: "payslips/me", element: <MyPayslipsPage /> },
	{ path: "payroll/admin", element: <PayrollAdminPage /> },
];
