import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./components/shell/AppShell";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./lib/auth";
import { FeaturesProvider, withFeature } from "./lib/feature-flags";
import { adminRoutes } from "./modules/admin/routes";
import { announcementsRoutes } from "./modules/announcements/routes";
import { approvalsRoutes } from "./modules/approvals/routes";
import { authRoutes } from "./modules/auth/routes";
import { assignmentsRoutes } from "./modules/assignments/routes";
import { incentiveRoutes } from "./modules/incentive/routes";
import { certificationRoutes } from "./modules/certification/routes";
import { claimsRoutes } from "./modules/claims/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { employeeRoutes } from "./modules/employee/routes";
import { helpRoutes } from "./modules/help/routes";
import { kpiRoutes } from "./modules/kpi/routes";
import { leaveRoutes } from "./modules/leave/routes";
import { notificationsRoutes } from "./modules/notifications/routes";
import { payslipRoutes } from "./modules/payslip/routes";
import { reportsRoutes } from "./modules/reports/routes";
import { scheduleRoutes } from "./modules/schedule/routes";

const DashboardPageLazy = lazy(() => import("./modules/dashboard/pages/DashboardPage"));

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
			...assignmentsRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("incentive", incentiveRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("leave", leaveRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("schedule", scheduleRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("claims", claimsRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("payslip", payslipRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("kpi", kpiRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("certification", certificationRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("notifications", notificationsRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("approvals", approvalsRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("dashboard", dashboardRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("reports", reportsRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...adminRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...helpRoutes.map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
			...withFeature("announcements", announcementsRoutes).map((r) => ({
				...r,
				path: r.path?.replace(/^\//, ""),
				element: <Suspense fallback={null}>{r.element}</Suspense>,
			})),
		],
	},
]);

const queryClient = new QueryClient();

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<FeaturesProvider>
					<RouterProvider router={router} />
					<Toaster />
				</FeaturesProvider>
			</AuthProvider>
		</QueryClientProvider>
	);
}
