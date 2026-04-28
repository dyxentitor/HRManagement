import { Suspense, lazy } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./components/shell/AppShell";
import { AuthProvider } from "./lib/auth";
import { approvalsRoutes } from "./modules/approvals/routes";
import { authRoutes } from "./modules/auth/routes";
import { certificationRoutes } from "./modules/certification/routes";
import { claimsRoutes } from "./modules/claims/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { employeeRoutes } from "./modules/employee/routes";
import { kpiRoutes } from "./modules/kpi/routes";
import { leaveRoutes } from "./modules/leave/routes";
import { notificationsRoutes } from "./modules/notifications/routes";
import { payslipRoutes } from "./modules/payslip/routes";
import { scheduleRoutes } from "./modules/schedule/routes";

const DashboardPageLazy = lazy(
	() => import("./modules/dashboard/pages/DashboardPage"),
);

const router = createBrowserRouter([
	...authRoutes,
	{
		path: "/",
		element: <AppShell />,
		children: [
			{
				index: true,
				element: (
					<Suspense fallback={null}>
						<DashboardPageLazy />
					</Suspense>
				),
			},
			...employeeRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...leaveRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...scheduleRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...claimsRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...payslipRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...kpiRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...certificationRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...notificationsRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...approvalsRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...dashboardRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
		],
	},
]);

export function App() {
	return (
		<AuthProvider>
			<RouterProvider router={router} />
		</AuthProvider>
	);
}
