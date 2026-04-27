import { Suspense, lazy } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./components/shell/AppShell";
import { AuthProvider } from "./lib/auth";
import { authRoutes } from "./modules/auth/routes";
import { employeeRoutes } from "./modules/employee/routes";
import { leaveRoutes } from "./modules/leave/routes";
import { scheduleRoutes } from "./modules/schedule/routes";

const HomePage = lazy(() => import("./pages/HomePage"));

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
						<HomePage />
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
