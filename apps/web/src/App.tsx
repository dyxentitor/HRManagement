import { Suspense, lazy } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./components/shell/AppShell";
import { AuthProvider } from "./lib/auth";
import { authRoutes } from "./modules/auth/routes";

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
